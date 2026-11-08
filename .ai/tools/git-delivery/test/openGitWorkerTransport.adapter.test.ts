/**
 * @file .ai/tools/git-delivery/test/openGitWorkerTransport.adapter.test.ts
 * @version 1.0.0
 * @date 2026-11-08
 * @description Проверяет общий Codex lease Git-воркера, отмену, очистку и отсутствие ambient auth fallback.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openGitWorkerTransport } from "../src/worker/openGitWorkerTransport.adapter.ts";
import type { GitWorkerTransport } from "../src/worker/GitWorker.types.ts";
import type { CodexConnectionLease } from "@realize/payload-ai-control/server/integration-runtime";

const fixture = () => {
  const events: string[] = [];
  const controller = new AbortController();
  const connection = new AbortController();
  const lease: CodexConnectionLease = {
    authMode: "accessToken",
    environment: {
      CODEX_HOME: "/fixture/isolated",
      CODEX_ACCESS_TOKEN: "fixture-scoped-token",
      PATH: "/fixture/bin",
    },
    home: "/fixture/isolated",
    search: {
      enabled: false,
      mode: "direct",
      model: "",
      developerInstructions: false,
    },
    revision: 3,
    signal: connection.signal,
    dispose: async () => {
      events.push("dispose");
      delete lease.environment.CODEX_ACCESS_TOKEN;
    },
  };
  const client: GitWorkerTransport = {
    start: () => {
      events.push("start");
    },
    request: async <T>() => JSON.parse('{"ok":true}') as T,
    notify: () => {
      events.push("notify");
    },
    getNotifications: async function* () {
      yield { method: "fixture/event" };
    },
    close: async () => {
      events.push("process-close");
    },
  };
  const resources = {
    codex: {
      acquire: async (options?: { isolated?: boolean }) => {
        events.push("acquire");
        assert.deepEqual(options, { isolated: true });
        return lease;
      },
    },
    close: async () => {
      events.push("pool-close");
    },
  };
  const options = { signal: controller.signal, onRequest: async () => null };
  return { events, controller, connection, lease, client, resources, options };
};

const expectSafeError = (code: string) => (error: unknown) => {
  assert.ok(error instanceof Error && "code" in error);
  assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /fixture-secret|postgres:|scoped-token/);
  assert.equal(error.cause, undefined);
  return true;
};

test("standalone использует isolated lease админки и закрывает процесс до credential и Pool", async () => {
  const f = fixture();
  const source = {
    HOME: "/fixture/ambient",
    CODEX_HOME: "/fixture/wrong",
    OPENAI_API_KEY: "fixture-secret",
  };
  const original = { ...source };
  const transport = await openGitWorkerTransport(
    "/fixture/repository",
    f.options,
    source,
    {
      openResources: async (root) => {
        assert.equal(root, "/fixture/repository");
        return f.resources;
      },
      createTransport: (root, options, ambient, environment) => {
        assert.equal(root, "/fixture/repository");
        assert.equal(ambient, source);
        assert.equal(options.onRequest, f.options.onRequest);
        assert.equal(environment, f.lease.environment);
        assert.equal(environment.OPENAI_API_KEY, undefined);
        assert.equal(environment.CODEX_ACCESS_TOKEN, "fixture-scoped-token");
        return f.client;
      },
    },
  );
  transport.start();
  assert.deepEqual(await transport.request("fixture"), { ok: true });
  transport.notify("fixture");
  assert.deepEqual(
    await transport.getNotifications()[Symbol.asyncIterator]().next(),
    { done: false, value: { method: "fixture/event" } },
  );
  await Promise.all([transport.close(), transport.close()]);
  assert.deepEqual(f.events, [
    "acquire",
    "start",
    "notify",
    "process-close",
    "dispose",
    "pool-close",
  ]);
  assert.equal(f.lease.environment.CODEX_ACCESS_TOKEN, undefined);
  assert.deepEqual(source, original);
});

test("вложенный явный parent profile не захватывает DB lock повторно", async () => {
  const f = fixture();
  const source = { REALIZE_GIT_CODEX_HOME: "/fixture/parent-run" };
  const transport = await openGitWorkerTransport(
    "/fixture/repository",
    f.options,
    source,
    {
      openResources: async () => {
        assert.fail("parent lease already owns the lock");
      },
      createTransport: (_root, _options, ambient, integration) => {
        assert.equal(ambient, source);
        assert.equal(integration, undefined);
        return f.client;
      },
    },
  );
  await transport.close();
  assert.deepEqual(f.events, ["process-close"]);
});

test("невалидный explicit profile не переключается на другую интеграцию", async () => {
  const f = fixture();
  await assert.rejects(
    openGitWorkerTransport(
      "/fixture/repository",
      f.options,
      { REALIZE_GIT_CODEX_HOME: "" },
      {
        openResources: async () => {
          assert.fail("invalid explicit profile must not fall back");
        },
      },
    ),
    expectSafeError("worker_profile_invalid"),
  );
});

for (const reason of ["missing", "disabled", "busy"]) {
  test(`при ${reason} integration закрывает Pool и не использует ambient credential`, async () => {
    const f = fixture();
    await assert.rejects(
      openGitWorkerTransport(
        "/fixture/repository",
        f.options,
        { CODEX_HOME: "/fixture/ambient", OPENAI_API_KEY: "fixture-secret" },
        {
          openResources: async () => ({
            ...f.resources,
            codex: {
              acquire: async () => {
                throw Error("fixture-secret " + reason);
              },
            },
          }),
          createTransport: () => {
            assert.fail("transport must not start without lease");
          },
        },
      ),
      expectSafeError("worker_connection_unavailable"),
    );
    assert.deepEqual(f.events, ["pool-close"]);
  });
}

test("отказ создания транспорта освобождает lease и Pool без raw errors", async () => {
  const f = fixture();
  await assert.rejects(
    openGitWorkerTransport(
      "/fixture/repository",
      f.options,
      {},
      {
        openResources: async () => f.resources,
        createTransport: () => {
          throw Error("fixture-secret spawn");
        },
      },
    ),
    expectSafeError("worker_connection_unavailable"),
  );
  assert.deepEqual(f.events, ["acquire", "dispose", "pool-close"]);
});

test("предварительная отмена не открывает БД и профиль", async () => {
  const f = fixture();
  f.controller.abort();
  await assert.rejects(
    openGitWorkerTransport(
      "/fixture/repository",
      f.options,
      {},
      {
        openResources: async () => {
          assert.fail("cancelled before resources");
        },
      },
    ),
    { name: "AbortError" },
  );
});

test("отмена во время acquire освобождает профиль без spawn", async () => {
  const f = fixture();
  await assert.rejects(
    openGitWorkerTransport(
      "/fixture/repository",
      f.options,
      {},
      {
        openResources: async () => ({
          ...f.resources,
          codex: {
            acquire: async () => {
              f.controller.abort();
              return f.lease;
            },
          },
        }),
        createTransport: () => {
          assert.fail("cancelled before transport");
        },
      },
    ),
    expectSafeError("worker_connection_unavailable"),
  );
  assert.deepEqual(f.events, ["dispose", "pool-close"]);
});

test("потеря registry signal отменяет transport; credential живёт до завершения close", async () => {
  const f = fixture();
  const exited = Promise.withResolvers<void>();
  let signal: AbortSignal | undefined;
  const transport = await openGitWorkerTransport(
    "/fixture/repository",
    f.options,
    {},
    {
      openResources: async () => f.resources,
      createTransport: (_root, options) => {
        signal = options.signal;
        return { ...f.client, close: () => exited.promise };
      },
    },
  );
  f.connection.abort();
  assert.equal(signal?.aborted, true);
  const closing = transport.close();
  await Promise.resolve();
  assert.equal(f.lease.environment.CODEX_ACCESS_TOKEN, "fixture-scoped-token");
  assert.deepEqual(f.events, ["acquire"]);
  exited.resolve();
  await closing;
  assert.deepEqual(f.events, ["acquire", "dispose", "pool-close"]);
});

test("ошибка refresh не оставляет Pool и не скрывается успешным close", async () => {
  const f = fixture();
  f.lease.dispose = async () => {
    f.events.push("dispose");
    throw Error("fixture-secret refresh");
  };
  const transport = await openGitWorkerTransport(
    "/fixture/repository",
    f.options,
    {},
    {
      openResources: async () => f.resources,
      createTransport: () => f.client,
    },
  );
  await assert.rejects(
    transport.close(),
    expectSafeError("worker_connection_cleanup_failed"),
  );
  await assert.rejects(
    transport.close(),
    expectSafeError("worker_connection_cleanup_failed"),
  );
  assert.deepEqual(f.events, [
    "acquire",
    "process-close",
    "dispose",
    "pool-close",
  ]);
});

test("передаёт scoped auth lease реальному RPC subprocess без ambient secrets", async (context) => {
  const f = fixture();
  const directory = await mkdtemp(join(tmpdir(), "realize-git-central-auth-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const profile = join(directory, "profile");
  await mkdir(profile);
  f.lease.home = profile;
  f.lease.environment = {
    CODEX_HOME: profile,
    CODEX_ACCESS_TOKEN: "fixture-scoped-token",
    PATH: directory,
  };
  await writeFile(
    join(directory, "codex"),
    `#!${process.execPath}
import {createInterface} from 'node:readline';
createInterface({input:process.stdin}).on('line', line => {
 const request=JSON.parse(line);
 if(request.method==='fixture/environment')process.stdout.write(JSON.stringify({id:request.id,result:{home:process.env.CODEX_HOME,token:process.env.CODEX_ACCESS_TOKEN,ambient:process.env.OPENAI_API_KEY??null,loader:process.env.NODE_OPTIONS??null,pid:process.pid}})+'\\n');
});
`,
    { mode: 0o700 },
  );
  const transport = await openGitWorkerTransport(
    directory,
    f.options,
    {
      OPENAI_API_KEY: "fixture-secret",
      NODE_OPTIONS: "--require=fixture-secret",
    },
    { openResources: async () => f.resources },
  );
  context.after(() => transport.close());
  transport.start();
  const result = await transport.request<{
    home: string;
    token: string;
    ambient: null;
    loader: null;
    pid: number;
  }>("fixture/environment");
  assert.equal(result.home, profile);
  assert.equal(result.token, "fixture-scoped-token");
  assert.equal(result.ambient, null);
  assert.equal(result.loader, null);
  await transport.close();
  assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
  assert.equal(f.lease.environment.CODEX_ACCESS_TOKEN, undefined);
  assert.deepEqual(f.events, ["acquire", "dispose", "pool-close"]);
});
