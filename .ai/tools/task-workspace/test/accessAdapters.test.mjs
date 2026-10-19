/**
 * @file .ai/tools/task-workspace/test/accessAdapters.test.mjs
 * @version 1.0.1
 * @date 2026-10-19
 * @description Проверяет private config, crash marker, настоящий межпроцессный flock и безопасный HTTP transport auth.
 * @see documentation/architecture/platform-access.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  accessStateDirectory,
  createAccessConfigRepository,
} from "../src/auth/AccessConfig.repository.mjs";
import { workspaceRoot } from "../src/workspacePaths.config.mjs";
import { createAccessRefreshState } from "../src/auth/AccessRefreshState.repository.mjs";
import { withAccessLock } from "../src/auth/withAccessLock.adapter.mjs";
import { requestAccessJson } from "../src/auth/requestAccessJson.adapter.mjs";
import { normalizeTaskManagerUrl } from "../src/auth/normalizeTaskManagerUrl.validator.mjs";
import { baseUrl, credential, response, codeIs } from "./authTest.fixture.mjs";

/** @param {import('node:test').TestContext} context */
function directory(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "realize-access-test-"));
  context.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return root;
}

test("config is read-only when absent and writes URL-only private atomic JSON", (context) => {
  const root = directory(context);
  const dir = path.join(root, "private");
  const config = createAccessConfigRepository(dir);
  assert.equal(config.read(), null);
  assert.ok(!fs.existsSync(dir));
  config.write(baseUrl + "/");
  assert.equal(config.read(), baseUrl);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  const file = path.join(dir, "connection.json");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
    schemaVersion: 1,
    baseUrl,
  });
  assert.deepEqual(fs.readdirSync(dir), ["connection.json"]);
});

test("config rejects symlink, broad permissions and unknown fields", (context) => {
  const root = directory(context);
  const config = createAccessConfigRepository(root);
  config.write(baseUrl);
  const file = path.join(root, "connection.json");
  fs.chmodSync(file, 0o644);
  assert.throws(() => config.read());
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(
    file,
    JSON.stringify({ schemaVersion: 1, baseUrl, token: "never-accepted" }),
  );
  assert.throws(() => config.read());
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(root, "absent"), file);
  assert.throws(() => config.read());
});

test("XDG state override is absolute and cannot point inside checkout directly or through symlink", (context) => {
  const root = directory(context);
  assert.equal(
    accessStateDirectory({ XDG_STATE_HOME: root }),
    path.join(root, "realize", "task-workspace-access"),
  );
  assert.throws(() => accessStateDirectory({ XDG_STATE_HOME: "relative" }));
  assert.throws(() => accessStateDirectory({ XDG_STATE_HOME: workspaceRoot }));
  fs.symlinkSync(workspaceRoot, path.join(root, "checkout"));
  assert.throws(() =>
    accessStateDirectory({
      XDG_STATE_HOME: path.join(root, "checkout", "new-state"),
    }),
  );
});

test("URL validation rejects credentials, cross-host HTTP and hidden path/query suffixes", () => {
  const credentialUrl = new URL("https://example.test/api/task-manager");
  credentialUrl.username = "user";
  credentialUrl.password = "secret";
  for (const url of [
    "http://remote.test/api/task-manager",
    credentialUrl.toString(),
    baseUrl + "?token=secret",
    baseUrl + "#secret",
    baseUrl + "/wrong",
    "file:///api/task-manager",
  ])
    assert.throws(() => normalizeTaskManagerUrl(url));
  assert.equal(
    normalizeTaskManagerUrl("http://127.0.0.1:3000/api/task-manager/"),
    "http://127.0.0.1:3000/api/task-manager",
  );
});

test("refresh marker survives repository recreation and contains no credentials", (context) => {
  const root = directory(context);
  const state = createAccessRefreshState(root);
  assert.equal(state.pending(baseUrl), false);
  state.begin(baseUrl);
  assert.equal(createAccessRefreshState(root).pending(baseUrl), true);
  const file = fs.readdirSync(root)[0];
  assert.equal(fs.statSync(path.join(root, file)).mode & 0o777, 0o600);
  assert.equal(
    fs.readFileSync(path.join(root, file), "utf8"),
    "refresh outcome pending\n",
  );
  assert.throws(() => state.begin(baseUrl));
  state.finish(baseUrl);
  assert.equal(state.pending(baseUrl), false);
});

test(
  "kernel lock serializes a distinct process and releases after SIGKILL",
  { timeout: 10000 },
  async (context) => {
    const root = directory(context);
    const module = new URL(
      "../src/auth/withAccessLock.adapter.mjs",
      import.meta.url,
    ).href;
    const code = `import { withAccessLock } from ${JSON.stringify(module)};
    await withAccessLock(process.argv[1], async () => {
      process.stdout.write('locked\\n');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }, process.argv[2]);`;
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", code, baseUrl, root],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    context.after(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    });
    await once(child.stdout, "data");
    let entered = false;
    const pending = withAccessLock(
      baseUrl,
      async () => {
        entered = true;
      },
      root,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(entered, false);
    const closed = once(child, "close");
    child.kill("SIGKILL");
    await closed;
    await pending;
    assert.equal(entered, true);
  },
);

test("HTTP auth transport omits bearer on device flow and never follows redirect or reflects secret body", async (context) => {
  let redirectHits = 0;
  /** @type {string|undefined} */ let authorization;
  const server = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    if (req.url === "/api/access/redirect-target") redirectHits++;
    if (req.url === "/api/access/device") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(response({ accepted: true })));
    } else if (req.url === "/api/access/redirect") {
      res.writeHead(302, { location: "/api/access/redirect-target" });
      res.end(credential().refreshToken);
    } else {
      res.writeHead(500);
      res.end(credential().accessToken);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/api/task-manager`;
  await requestAccessJson(url, {
    method: "POST",
    path: "/device",
    payload: {},
  });
  assert.equal(authorization, undefined);
  await assert.rejects(
    requestAccessJson(url, {
      method: "GET",
      path: "/redirect",
      token: "private-test-only",
    }),
    codeIs("auth_http_302"),
  );
  assert.equal(authorization, "Bearer private-test-only");
  assert.equal(redirectHits, 0);
  await assert.rejects(
    requestAccessJson(url, {
      method: "POST",
      path: "/session/refresh",
      payload: { refreshToken: credential().refreshToken },
    }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(credential().accessToken));
      return true;
    },
  );
});

test("actual CLI auth-status needs no TASK flags and prints only session metadata", async (context) => {
  const root = directory(context);
  const server = http.createServer((req, res) => {
    assert.equal(req.url, "/api/access/session");
    assert.equal(req.headers.authorization, "Bearer synthetic-cli-token");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        response({ actor: credential().actor, token: credential().token }),
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const child = spawn(
    process.execPath,
    [
      "--import=tsx/esm",
      fileURLToPath(
        new URL(
          "../src/cli/runWorkspaceCommand.controller.mjs",
          import.meta.url,
        ),
      ),
      "auth-status",
      "--compact",
    ],
    {
      cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        REALIZE_TASK_MANAGER_URL: `http://127.0.0.1:${address.port}/api/task-manager`,
        REALIZE_TASK_MANAGER_TOKEN: "synthetic-cli-token",
      },
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (value) => {
    stdout += value;
  });
  child.stderr.on("data", (value) => {
    stderr += value;
  });
  const [code] = await once(child, "close");
  assert.equal(code, 0, stderr);
  const output = JSON.parse(stdout);
  assert.equal(output.data.status, "authenticated");
  assert.equal(output.key, null);
  assert.ok(!stdout.includes("synthetic-cli-token"));
  assert.ok(!stdout.includes(credential().refreshToken));
  assert.deepEqual(fs.readdirSync(root), []);
});

test("HTTP auth adapter preserves only proven pre-connect refusal as offline classification", async () => {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(
    requestAccessJson(`http://127.0.0.1:${address.port}/api/task-manager`, {
      method: "POST",
      path: "/session/refresh",
      payload: { refreshToken: credential().refreshToken },
    }),
    codeIs("auth_preconnect_unavailable"),
  );
});
