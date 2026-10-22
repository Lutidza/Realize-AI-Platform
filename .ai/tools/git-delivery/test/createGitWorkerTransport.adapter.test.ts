/**
 * @file .ai/tools/git-delivery/test/createGitWorkerTransport.adapter.test.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет явный профиль Git-воркера и окружение реального дочернего RPC-процесса.
 */
import { PolicyError } from "@realize/git-runtime";

import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createGitWorkerEnvironment } from "../src/worker/createGitWorkerEnvironment.adapter.ts";
import { createGitWorkerTransport } from "../src/worker/createGitWorkerTransport.adapter.ts";

const PROFILE_HOME = resolve(".ai-workspace/git-worker-test-profile");
const AMBIENT_ENVIRONMENT = {
  HOME: resolve(".ai-workspace/git-worker-test-home"),
  CODEX_HOME: resolve(".ai-workspace/git-worker-test-ambient-profile"),
  OPENAI_API_KEY: "fixture-openai-key",
  CODEX_API_KEY: "fixture-codex-key",
  OPENAI_ACCESS_TOKEN: "fixture-access-token",
  NODE_OPTIONS: "--require=fixture-untrusted-loader",
};

test("назначает только явный профиль и сохраняет разрешённое общее окружение", () => {
  const source = {
    ...AMBIENT_ENVIRONMENT,
    REALIZE_GIT_CODEX_HOME: PROFILE_HOME,
    NODE_ENV: "test",
    PATH: "/fixture/bin",
    HTTPS_PROXY: "https://fixture-proxy.invalid",
    LANG: "ru_RU.UTF-8",
    UNRELATED_SETTING: "fixture-unrelated-value",
  };
  const original = { ...source };

  assert.deepEqual(createGitWorkerEnvironment(source), {
    NODE_ENV: "test",
    HOME: source.HOME,
    HTTPS_PROXY: source.HTTPS_PROXY,
    LANG: source.LANG,
    PATH: source.PATH,
    CODEX_HOME: PROFILE_HOME,
  });
  assert.deepEqual(source, original);
});

for (const [label, profileHome] of [
  ["отсутствующий", undefined],
  ["пустой", ""],
  ["пробельный", " "],
  ["относительный", "private-relative-profile"],
  ["содержащий NUL", `${PROFILE_HOME}\0private-invalid-suffix`],
] as const) {
  test(`блокирует ${label} профиль до запуска, не используя ambient auth`, () => {
    const source = {
      ...AMBIENT_ENVIRONMENT,
      REALIZE_GIT_CODEX_HOME: profileHome,
    };
    const expectProfileError = (error: unknown): boolean => {
      assert.ok(error instanceof PolicyError);
      assert.equal(error.code, "worker_profile_invalid");
      assert.match(error.message, /REALIZE_GIT_CODEX_HOME/);
      assert.doesNotMatch(error.message, /fixture-|private-/);
      assert.equal(error.cause, undefined);
      return true;
    };

    assert.throws(() => createGitWorkerEnvironment(source), expectProfileError);
    assert.throws(
      () =>
        createGitWorkerTransport(
          process.cwd(),
          {
            signal: new AbortController().signal,
            onRequest: async () => null,
          },
          source,
        ),
      expectProfileError,
    );
  });
}

test(
  "передаёт профиль и ограничения в дочерний RPC-процесс, обслуживает callback и закрывается",
  { timeout: 5_000, skip: process.platform === "win32" },
  async (context) => {
    const fixtureRoot = resolve(
      ".ai-workspace/tasks/2026-09-12-git-worker-transport/tmp",
    );
    await mkdir(fixtureRoot, { recursive: true });
    const directory = await mkdtemp(join(fixtureRoot, "transport-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const profileHome = join(directory, "profile with spaces");
    await mkdir(profileHome);
    // PATH подменяет только исполняемый файл; транспорт сам создаёт Node-процесс.
    await writeFile(
      join(directory, "codex"),
      `#!${process.execPath}
import { createInterface } from 'node:readline';
const send = message => process.stdout.write(JSON.stringify(message) + '\\n');
const lines = createInterface({ input: process.stdin });
lines.on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'fixture/environment') {
    send({ id: request.id, result: {
      environment: process.env, args: process.argv.slice(2), cwd: process.cwd(), pid: process.pid
    } });
    send({ id: 'fixture-call', method: 'item/tool/call', params: { name: 'git_inspect' } });
  } else if (request.id === 'fixture-call') {
    send({ method: 'fixture/callback', params: request.result });
  }
});
`,
      { mode: 0o700 },
    );
    const controller = new AbortController();
    const calls: unknown[] = [];
    const transport = createGitWorkerTransport(
      directory,
      {
        signal: controller.signal,
        onRequest: async (method, params) => {
          calls.push([method, params]);
          return { accepted: true };
        },
      },
      {
        ...AMBIENT_ENVIRONMENT,
        REALIZE_GIT_CODEX_HOME: profileHome,
        PATH: directory,
      },
    );
    context.after(() => transport.close());
    transport.start();
    const snapshot = await transport.request<{
      environment: NodeJS.ProcessEnv;
      args: string[];
      cwd: string;
      pid: number;
    }>("fixture/environment");

    assert.deepEqual(snapshot.environment, {
      NODE_ENV: "development",
      HOME: AMBIENT_ENVIRONMENT.HOME,
      PATH: directory,
      CODEX_HOME: profileHome,
    });
    assert.equal(snapshot.cwd, directory);
    assert.deepEqual(snapshot.args.slice(0, 4), [
      "app-server",
      "--listen",
      "stdio://",
      "--strict-config",
    ]);
    for (const restriction of [
      'approval_policy="never"',
      'sandbox_mode="read-only"',
      'web_search="disabled"',
      "project_doc_max_bytes=0",
      "mcp_servers={}",
      "plugins={}",
      "features.shell_tool=false",
      "features.unified_exec=false",
      "features.apply_patch_freeform=false",
      "features.multi_agent=false",
    ]) {
      const index = snapshot.args.indexOf(restriction);
      assert.ok(index >= 4, restriction);
      assert.equal(snapshot.args[index - 1], "-c");
    }
    const notifications = transport.getNotifications()[Symbol.asyncIterator]();
    assert.deepEqual(await notifications.next(), {
      value: { method: "fixture/callback", params: { accepted: true } },
      done: false,
    });
    assert.deepEqual(calls, [["item/tool/call", { name: "git_inspect" }]]);
    await transport.close();
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.throws(() => process.kill(snapshot.pid, 0), { code: "ESRCH" });
  },
);
