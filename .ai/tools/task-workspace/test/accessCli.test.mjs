/**
 * @file .ai/tools/task-workspace/test/accessCli.test.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет device flow, env precedence, rotating refresh, отмену и отсутствие секретов в CLI output.
 * @see documentation/architecture/platform-access.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkspaceArguments } from "../src/cli/parseWorkspaceArguments.validator.mjs";
import { presentCompactWorkspaceResponse } from "../src/cli/presentCompactWorkspaceResponse.util.mjs";
import {
  runAuthCommand,
  isAuthCommand,
} from "../src/auth/runAuthCommand.controller.mjs";
import { resolveRemoteWorkspaceConfig } from "../src/auth/resolveRemoteWorkspaceConfig.service.mjs";
import { loginAccess } from "../src/auth/loginAccess.service.mjs";
import { WorkspaceError } from "../src/Workspace.error.mjs";
import {
  fixture,
  baseUrl,
  credential,
  response,
  start,
  codeIs,
} from "./authTest.fixture.mjs";

test("auth parser accepts only explicit auth flags without task", () => {
  for (const args of [
    ["login"],
    [
      "login",
      "--url",
      baseUrl,
      "--name",
      "My CLI",
      "--no-browser",
      "--compact",
    ],
    ["logout"],
    ["auth-status", "--url", baseUrl],
  ])
    assert.ok(isAuthCommand(parseWorkspaceArguments(args)));
  for (const args of [
    ["logout", "--no-browser"],
    ["auth-status", "--task", "x"],
    ["login", "--token", "secret"],
    ["login", "--name", " "],
  ])
    assert.throws(() => parseWorkspaceArguments(args));
});

test("complete env bypasses saved URL, keyring and refresh; partial token cannot borrow selected URL", async () => {
  const f = fixture();
  f.deps.config.read = () => {
    throw new Error("must not read");
  };
  assert.deepEqual(
    await resolveRemoteWorkspaceConfig(
      {
        REALIZE_TASK_MANAGER_URL: baseUrl + "/",
        REALIZE_TASK_MANAGER_TOKEN: "explicit-token",
      },
      f.deps,
    ),
    { baseUrl, token: "explicit-token" },
  );
  await assert.rejects(
    resolveRemoteWorkspaceConfig(
      { REALIZE_TASK_MANAGER_TOKEN: "explicit-token" },
      f.deps,
    ),
    codeIs("remote_config_incomplete"),
  );
  assert.deepEqual(f.events, []);
});

test("unconfigured CLI returns null; URL-only resolves credentials for exact installation", async () => {
  const f = fixture();
  assert.equal(await resolveRemoteWorkspaceConfig({}, f.deps), null);
  f.stored.set(baseUrl, credential());
  assert.equal(
    (
      await resolveRemoteWorkspaceConfig(
        { REALIZE_TASK_MANAGER_URL: baseUrl },
        f.deps,
      )
    )?.token,
    credential().accessToken,
  );
  await assert.rejects(
    resolveRemoteWorkspaceConfig(
      { REALIZE_TASK_MANAGER_URL: "https://other.test/api/task-manager" },
      f.deps,
    ),
    codeIs("remote_config_incomplete"),
  );
  f.select(baseUrl);
  assert.equal(
    (await resolveRemoteWorkspaceConfig({}, f.deps))?.baseUrl,
    baseUrl,
  );
});

test("concurrent commands reread keyring under lock and refresh only once", async () => {
  const f = fixture();
  f.select(baseUrl);
  f.stored.set(baseUrl, credential(20));
  let calls = 0;
  f.deps.transport = async (_, input) => {
    assert.equal(input.path, "/session/refresh");
    assert.ok(f.pending.has(baseUrl));
    calls++;
    return response(credential(900, "b"));
  };
  const results = await Promise.all([
    resolveRemoteWorkspaceConfig({}, f.deps),
    resolveRemoteWorkspaceConfig({}, f.deps),
  ]);
  assert.equal(calls, 1);
  assert.ok(
    results.every((value) => value?.token === credential(900, "b").accessToken),
  );
  assert.ok(!f.pending.has(baseUrl));
});

test("ambiguous refresh invalidates credential, attempts logout and never retries old secret", async () => {
  const f = fixture();
  f.select(baseUrl);
  f.stored.set(baseUrl, credential(20));
  /** @type {string[]} */ const calls = [];
  f.deps.transport = async (_, input) => {
    calls.push(input.path);
    throw new Error(credential().refreshToken);
  };
  await assert.rejects(
    resolveRemoteWorkspaceConfig({}, f.deps),
    codeIs("auth_login_required"),
  );
  await assert.rejects(
    resolveRemoteWorkspaceConfig({}, f.deps),
    codeIs("auth_login_required"),
  );
  assert.deepEqual(calls, ["/session/refresh", "/session/logout"]);
  assert.equal(f.stored.size, 0);
});

test("proven pre-connect refresh refusal preserves credential and clears intent for later retry", async () => {
  const f = fixture();
  f.select(baseUrl);
  f.stored.set(baseUrl, credential(-1));
  let refreshes = 0;
  f.deps.transport = async (_, input) => {
    assert.equal(input.path, "/session/refresh");
    refreshes++;
    throw new WorkspaceError("auth_preconnect_unavailable");
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(
      (await resolveRemoteWorkspaceConfig({}, f.deps))?.token,
      credential(-1).accessToken,
    );
    assert.equal(f.pending.has(baseUrl), false);
    assert.equal(
      f.stored.get(baseUrl)?.refreshToken,
      credential(-1).refreshToken,
    );
  }
  assert.equal(refreshes, 2);
  assert.ok(!f.events.includes("remove"));
});

test("persisted refresh marker blocks reuse even when keyring deletion failed", async () => {
  const f = fixture();
  f.select(baseUrl);
  f.stored.set(baseUrl, credential(20));
  let refreshes = 0;
  f.deps.transport = async (_, input) => {
    if (input.path === "/session/refresh") refreshes++;
    throw new Error("ambiguous");
  };
  f.deps.keyring.remove = async () => {
    throw new Error("locked keyring");
  };
  await assert.rejects(resolveRemoteWorkspaceConfig({}, f.deps));
  await assert.rejects(resolveRemoteWorkspaceConfig({}, f.deps));
  assert.equal(refreshes, 1);
  assert.ok(f.pending.has(baseUrl));
});

test("crash marker and malformed refreshed identity require new login", async () => {
  for (const crash of [false, true]) {
    const f = fixture();
    f.select(baseUrl);
    f.stored.set(baseUrl, credential(20));
    if (crash) f.pending.add(baseUrl);
    /** @type {string[]} */ const calls = [];
    f.deps.transport = async (_, input) => {
      calls.push(input.path);
      return response({
        ...credential(900, "b"),
        actor: { id: "other", name: "Other" },
      });
    };
    await assert.rejects(
      resolveRemoteWorkspaceConfig({}, f.deps),
      codeIs("auth_login_required"),
    );
    assert.deepEqual(
      calls,
      crash ? ["/session/logout"] : ["/session/refresh", "/session/logout"],
    );
  }
});

test("device login prints code before polling, observes slow_down and saves before success", async () => {
  const f = fixture();
  let polls = 0;
  f.deps.transport = async (_, input) => {
    f.events.push(input.path);
    if (input.path === "/device") return response(start);
    assert.equal(input.path, "/device/token");
    assert.ok(f.events.indexOf("notice") < f.events.indexOf("/device/token"));
    polls++;
    return response(
      polls === 1
        ? { status: "slow_down", interval: 10, credential: null }
        : { status: "issued", interval: 10, credential: credential() },
    );
  };
  const data = await loginAccess(baseUrl, {}, f.deps);
  assert.deepEqual(f.waits, [5000, 10000]);
  assert.equal(f.selected(), baseUrl);
  assert.equal(f.stored.size, 1);
  assert.equal(data.status, "authenticated");
  assert.ok(!JSON.stringify(data).includes(credential().accessToken));
  assert.ok(!JSON.stringify(data).includes(credential().refreshToken));
  assert.ok(f.events.includes("browser"));
});

test("--no-browser still announces verification URL and code", async () => {
  const f = fixture();
  f.deps.transport = async (_, input) =>
    response(
      input.path === "/device"
        ? start
        : { status: "issued", interval: 5, credential: credential() },
    );
  await loginAccess(baseUrl, { "no-browser": true }, f.deps);
  assert.ok(f.events.includes("notice"));
  assert.ok(!f.events.includes("browser"));
});

test("keyring must work before any device request", async () => {
  const f = fixture();
  f.deps.keyring.probe = async () => {
    throw new Error("keyring unavailable");
  };
  let calls = 0;
  f.deps.transport = async () => {
    calls++;
  };
  await assert.rejects(loginAccess(baseUrl, {}, f.deps));
  assert.equal(calls, 0);
});

test("untrusted verification URI and keyring save failure cancel device without showing secrets", async () => {
  for (const invalidUri of [false, true]) {
    const f = fixture();
    /** @type {string[]} */ const calls = [];
    f.deps.keyring.write = async () => {
      throw new Error("cannot save");
    };
    f.deps.transport = async (_, input) => {
      calls.push(input.path);
      return response(
        input.path === "/device"
          ? {
              ...start,
              verificationUri: invalidUri
                ? "https://evil.test/system/access/device"
                : start.verificationUri,
            }
          : input.path === "/device/cancel"
            ? { cancelled: true }
            : { status: "issued", interval: 5, credential: credential() },
      );
    };
    await assert.rejects(loginAccess(baseUrl, {}, f.deps));
    assert.equal(calls.at(-1), "/device/cancel");
    assert.equal(f.stored.size, 0);
    if (invalidUri) assert.ok(!f.events.includes("notice"));
  }
});

test("denied, interrupted, expired and polling errors perform bounded cancellation", async () => {
  for (const mode of ["denied", "signal", "expired", "network"]) {
    const f = fixture();
    const abort = new AbortController();
    /** @type {string[]} */ const calls = [];
    f.deps.transport = async (_, input) => {
      calls.push(input.path);
      if (input.path === "/device") return response(start);
      if (input.path === "/device/cancel") {
        assert.equal(input.timeoutMs, 3000);
        assert.equal(input.signal, undefined);
        return response({ cancelled: true });
      }
      if (mode === "network") throw new Error("network");
      return response({
        status: mode === "denied" ? "access_denied" : "authorization_pending",
        interval: 5,
        credential: null,
      });
    };
    if (mode === "signal")
      f.deps.sleep = async () => {
        abort.abort();
      };
    if (mode === "expired")
      f.deps.sleep = async () => {
        f.advance(600000);
      };
    await assert.rejects(loginAccess(baseUrl, {}, f.deps, abort.signal));
    assert.equal(calls.at(-1), "/device/cancel");
    assert.equal(f.stored.size, 0);
  }
});

test("login config failure restores prior credential and cancels new issue", async () => {
  const f = fixture();
  f.stored.set(baseUrl, credential());
  f.deps.config.write = () => {
    throw new Error("read only");
  };
  /** @type {string[]} */ const calls = [];
  f.deps.transport = async (_, input) => {
    calls.push(input.path);
    return response(
      input.path === "/device"
        ? start
        : input.path === "/device/cancel"
          ? { cancelled: true }
          : { status: "issued", interval: 5, credential: credential(900, "b") },
    );
  };
  await assert.rejects(loginAccess(baseUrl, {}, f.deps));
  assert.equal(f.stored.get(baseUrl)?.accessToken, credential().accessToken);
  assert.equal(calls.at(-1), "/device/cancel");
});

test("late issued response after TTL or signal is revoked by refresh without keyring write", async () => {
  for (const mode of ["expired", "signal"]) {
    const f = fixture();
    const abort = new AbortController();
    /** @type {string[]} */ const calls = [];
    f.deps.transport = async (_, input) => {
      calls.push(input.path);
      if (input.path === "/device") return response(start);
      if (input.path === "/device/token") {
        if (mode === "expired") f.advance(601000);
        else abort.abort();
        return response({
          status: "issued",
          interval: 5,
          credential: credential(),
        });
      }
      if (input.path === "/session/logout") {
        assert.deepEqual(input.payload, {
          refreshToken: credential().refreshToken,
        });
        assert.equal(input.signal, undefined);
        assert.equal(input.timeoutMs, 3000);
        return response({ revoked: true });
      }
      assert.equal(input.path, "/device/cancel");
      throw new Error("expired device cancellation");
    };
    await assert.rejects(
      loginAccess(baseUrl, {}, f.deps, abort.signal),
      codeIs("auth_cancelled"),
    );
    assert.deepEqual(calls, [
      "/device",
      "/device/token",
      "/session/logout",
      "/device/cancel",
    ]);
    assert.ok(!f.events.includes("save"));
    assert.equal(f.stored.size, 0);
  }
});

test("online auth-status returns safe actor/scopes; compact keeps metadata", async () => {
  const f = fixture();
  f.select(baseUrl);
  f.stored.set(baseUrl, credential());
  f.deps.transport = async (_, input) => {
    assert.equal(input.path, "/session");
    assert.equal(input.token, credential().accessToken);
    return response({ actor: credential().actor, token: credential().token });
  };
  const request = parseWorkspaceArguments(["auth-status", "--compact"]);
  assert.ok(isAuthCommand(request));
  const output = await runAuthCommand(request, f.deps);
  const compact = presentCompactWorkspaceResponse(request, output);
  assert.ok(compact.data && "status" in compact.data);
  assert.equal(compact.data.status, "authenticated");
  assert.ok(!JSON.stringify(compact).includes(credential().accessToken));
  assert.equal(compact.key, null);
});

test("logout removes local credential even on remote failure and explains env override", async () => {
  const f = fixture();
  f.select(baseUrl);
  f.stored.set(baseUrl, credential());
  f.deps.env.REALIZE_TASK_MANAGER_TOKEN = "environment-secret";
  f.deps.transport = async () => {
    throw new Error("offline");
  };
  const output = await runAuthCommand({ action: "logout", flags: {} }, f.deps);
  assert.equal(f.stored.size, 0);
  assert.equal(output.data.remoteRevoked, false);
  assert.match(output.data.warning ?? "", /REALIZE_TASK_MANAGER_TOKEN/);
  assert.ok(!JSON.stringify(output).includes("environment-secret"));
});

test("status without configuration does no keyring or HTTP work", async () => {
  const f = fixture();
  assert.equal(
    (await runAuthCommand({ action: "auth-status", flags: {} }, f.deps)).data
      .status,
    "not_configured",
  );
  assert.deepEqual(f.events, []);
});

test("auth-status cannot redirect env bearer with explicit URL or borrow URL for a token-only env", async () => {
  for (const url of [
    "https://other.test/api/task-manager",
    "https://example.test/other/api/task-manager",
  ]) {
    const f = fixture();
    f.deps.env = {
      REALIZE_TASK_MANAGER_URL: baseUrl,
      REALIZE_TASK_MANAGER_TOKEN: "bound-to-original-url",
    };
    let calls = 0;
    f.deps.transport = async () => {
      calls++;
    };
    await assert.rejects(
      runAuthCommand({ action: "auth-status", flags: { url } }, f.deps),
      codeIs("auth_url_conflict"),
    );
    assert.equal(calls, 0);
    assert.deepEqual(f.events, []);
  }
  for (const explicit of [false, true]) {
    const f = fixture();
    f.select(baseUrl);
    f.deps.env = { REALIZE_TASK_MANAGER_TOKEN: "unbound-token" };
    let calls = 0;
    f.deps.transport = async () => {
      calls++;
    };
    await assert.rejects(
      runAuthCommand(
        { action: "auth-status", flags: explicit ? { url: baseUrl } : {} },
        f.deps,
      ),
      codeIs("remote_config_incomplete"),
    );
    assert.equal(calls, 0);
  }
});

test("auth-status accepts matching normalized env URL and explicit flag", async () => {
  const f = fixture();
  f.deps.env = {
    REALIZE_TASK_MANAGER_URL: baseUrl + "/",
    REALIZE_TASK_MANAGER_TOKEN: "same-installation-token",
  };
  f.deps.transport = async (url, input) => {
    assert.equal(url, baseUrl);
    assert.equal(input.token, "same-installation-token");
    return response({ actor: credential().actor, token: null });
  };
  assert.equal(
    (
      await runAuthCommand(
        { action: "auth-status", flags: { url: baseUrl } },
        f.deps,
      )
    ).data.status,
    "authenticated",
  );
});
