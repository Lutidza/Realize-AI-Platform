/**
 * @file .ai/tools/git-delivery/test/runGitInspect.service.test.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет программный inspect, неизменность Git, область снимка и CLI без настроек Codex.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { PolicyError } from "@realize/git-runtime";
import type { Context } from "../src/contracts.ts";
import { emptyResult } from "../src/emptyResult.util.ts";
import { deliverGitWorkerCommand } from "../src/worker/deliverGitWorkerCommand.service.ts";
import { loadGitWorkerContext } from "../src/worker/loadGitWorkerContext.adapter.ts";
import { runGitInspect } from "../src/worker/runGitInspect.service.ts";
import { createDeliveryFixture } from "./fixtures/createDeliveryFixture.adapter.ts";

const execute = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

test("inspect сохраняет HEAD/index/files, ограничивает scope и обновляет fingerprint входов", async (t) => {
  const f = await createDeliveryFixture(t);
  const context = await loadGitWorkerContext("inspect", f.root);
  context.authorization.scope = { mode: "paths", paths: ["owned.txt"] };
  if ("target" in context || "operation" in context)
    assert.fail("local context required");
  context.verification = {
    inputPaths: ["checks-config.json"],
    requiredChecks: [],
    results: [],
  };
  await f.write("owned.txt", "owned change\n");
  await f.write("foreign.txt", "foreign change\n");
  const before = {
    head: await f.head(),
    index: await f.index(),
    owned: await readFile(join(f.root, "owned.txt")),
  };
  const inspect = () => runGitInspect(context, deliverGitWorkerCommand);
  const first = await inspect();
  assert.equal(first.status, "succeeded");
  assert.ok(first.result && "fingerprint" in first.result);
  assert.deepEqual(
    first.result.changes?.items.map((change) => change.path),
    ["owned.txt"],
  );
  assert.equal(first.worker.model, null);
  assert.equal(first.worker.threadId, null);
  assert.equal(first.worker.turnId, null);
  assert.equal(first.worker.instructionBytes, 0);
  assert.equal(first.worker.handlerCalls, 1);
  assert.deepEqual(first.worker.usage, {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  });
  assert.equal(await f.head(), before.head);
  assert.deepEqual(await f.index(), before.index);
  assert.deepEqual(await readFile(join(f.root, "owned.txt")), before.owned);
  const same = await inspect();
  assert.ok(same.result && "fingerprint" in same.result);
  assert.equal(same.result.fingerprint, first.result.fingerprint);
  await f.write("checks-config.json", '{"changed":true}\n');
  const changed = await inspect();
  assert.ok(changed.result && "fingerprint" in changed.result);
  assert.notEqual(changed.result.fingerprint, first.result.fingerprint);
});

test("неверные полномочия и scope блокируются до handler", async (t) => {
  const f = await createDeliveryFixture(t);
  const base = (await loadGitWorkerContext("inspect", f.root)) as Context;
  const cases = [
    { authorization: { actions: ["commit"], scope: { mode: "all" } } },
    {
      authorization: { actions: ["inspect", "commit"], scope: { mode: "all" } },
    },
    {
      authorization: {
        actions: ["inspect"],
        scope: { mode: "paths", paths: ["../escape"] },
      },
    },
    { identity: { name: "Unexpected", email: "fixture@example.invalid" } },
    { verification: { inputPaths: [], requiredChecks: ["unit"], results: [] } },
  ];
  for (const change of cases) {
    const result = await runGitInspect(
      { ...base, ...change } as Context,
      async () => {
        assert.fail("Недопустимый контекст не достигает handler");
      },
    );
    assert.equal(result.status, "blocked");
    assert.equal(result.worker.handlerCalls, 0);
    assert.equal(result.result, null);
  }
});

test("отмена до чтения не вызывает handler, отмена во время чтения сохраняет его результат", async (t) => {
  const f = await createDeliveryFixture(t);
  const context = await loadGitWorkerContext("inspect", f.root);
  const abort = new AbortController();
  abort.abort();
  const cancelled = await runGitInspect(
    context,
    async () => assert.fail("Не запускать чтение"),
    abort.signal,
  );
  assert.equal(cancelled.errorCode, "worker_cancelled");
  assert.equal(cancelled.worker.handlerCalls, 0);
  const during = new AbortController();
  const result = {
    ...emptyResult(),
    action: "inspect" as const,
    status: "succeeded" as const,
  };
  const drained = await runGitInspect(
    context,
    async () => {
      during.abort();
      await new Promise<void>((resolve) => setImmediate(resolve));
      return result;
    },
    during.signal,
  );
  assert.equal(drained.status, "blocked");
  assert.equal(drained.errorCode, "worker_cancelled");
  assert.deepEqual(drained.result, result);
});

test("ошибки handler сохраняют status/code, исключения не раскрывают диагностические данные", async (t) => {
  const f = await createDeliveryFixture(t);
  const context = await loadGitWorkerContext("inspect", f.root);
  for (const status of ["blocked", "failed", "partial"] as const) {
    const report = await runGitInspect(context, async () => ({
      ...emptyResult(),
      action: "inspect",
      status,
      errorCode: "fixture_failure",
    }));
    assert.equal(report.status, status === "partial" ? "failed" : status);
    assert.equal(report.errorCode, "fixture_failure");
  }
  for (const error of [
    new Error("PRIVATE_DIAGNOSTIC"),
    new PolicyError("fixture_policy", "PRIVATE_DIAGNOSTIC"),
  ]) {
    const report = await runGitInspect(context, async () => {
      throw error;
    });
    assert.equal(
      report.errorCode,
      error instanceof PolicyError
        ? "fixture_policy"
        : "worker_operation_failed",
    );
    assert.ok(!JSON.stringify(report).includes("PRIVATE_DIAGNOSTIC"));
  }
});

test("CLI inspect работает без .codex/profile, не принимает message и чужую рабочую копию", async (t) => {
  const f = await createDeliveryFixture(t);
  const tool = join(f.root, ".ai/tools/git-delivery");
  await mkdir(tool, { recursive: true });
  await cp(
    join(repositoryRoot, ".ai/tools/git-delivery/src"),
    join(tool, "src"),
    { recursive: true },
  );
  await writeFile(join(f.root, "package.json"), '{"type":"module"}\n');
  await symlink(
    join(repositoryRoot, "node_modules"),
    join(f.root, "node_modules"),
    "dir",
  );
  await f.write(".gitignore", "/.ai/\n/.ai-workspace/\n/node_modules/\n");
  const controller = join(tool, "src/worker/runGitWorker.controller.ts");
  const env = { ...process.env };
  delete env.REALIZE_GIT_CODEX_HOME;
  delete env.REALIZE_GIT_CONTEXT_FILE;
  delete env.REALIZE_GIT_VERIFICATION_PLAN;
  const options = { cwd: f.root, env, timeout: 30_000, maxBuffer: 128 * 1024 };
  const before = { head: await f.head(), index: await f.index() };
  const completed = await execute(
    process.execPath,
    ["--import", "tsx", controller, "inspect"],
    options,
  );
  const report = JSON.parse(completed.stdout);
  assert.equal(report.status, "succeeded");
  assert.deepEqual(report.command, { action: "inspect" });
  assert.equal(report.worker.model, null);
  assert.equal(report.worker.handlerCalls, 1);
  assert.deepEqual(report.worker.usage, {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  });
  assert.equal(await f.head(), before.head);
  assert.deepEqual(await f.index(), before.index);
  await assert.rejects(
    execute(
      process.execPath,
      ["--import", "tsx", controller, "inspect", "unexpected"],
      options,
    ),
    (error: unknown) => {
      const failure = error as { code: number; stdout: string };
      assert.equal(failure.code, 2);
      assert.equal(
        JSON.parse(failure.stdout).errorCode,
        "worker_action_unavailable",
      );
      return true;
    },
  );
  const context = await loadGitWorkerContext("inspect", repositoryRoot);
  const contextPath = join(f.temporary, "context.json");
  await writeFile(contextPath, JSON.stringify(context), { mode: 0o600 });
  await assert.rejects(
    execute(process.execPath, ["--import", "tsx", controller, "inspect"], {
      ...options,
      env: { ...env, REALIZE_GIT_CONTEXT_FILE: contextPath },
    }),
    (error: unknown) => {
      const failure = error as { code: number; stdout: string };
      assert.equal(failure.code, 2);
      assert.equal(
        JSON.parse(failure.stdout).errorCode,
        "worker_repository_mismatch",
      );
      return true;
    },
  );
});
