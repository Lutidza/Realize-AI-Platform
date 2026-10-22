/**
 * @file .ai/tools/git-delivery/test/GitWorkerAssignedOperations.test.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет назначенные manage/fetch/pull capability без Git-операций, сети и обращения к реальным credential profiles.
 */
import { PolicyError } from "@realize/git-runtime";

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { emptyResult } from "../src/contracts.ts";
import type { GitManageContext } from "../src/manage/GitManage.types.ts";
import type { GitSyncContext } from "../src/sync/GitSync.types.ts";
import { GitWorkerCapabilityService } from "../src/worker/GitWorkerCapability.service.ts";
import type { GitWorkerResult } from "../src/worker/GitWorker.types.ts";
import { loadGitWorkerSettings } from "../src/worker/loadGitWorkerSettings.adapter.ts";
import { parseGitWorkerCommand } from "../src/worker/parseGitWorkerCommand.validator.ts";

type AssignedAction = "manage" | "fetch" | "pull";
const actions: AssignedAction[] = ["manage", "fetch", "pull"];

function context(action: AssignedAction): GitManageContext | GitSyncContext {
  const base = {
    version: 1 as const,
    requestId: "assigned-worker-request",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: "/nonexistent-assigned-worker-fixture",
  };
  if (action === "manage")
    return {
      ...base,
      authorization: { actions: ["manage"], scope: { mode: "repository" } },
      operation: {
        kind: "branch-create",
        name: "assigned-branch",
        switch: false,
      },
      expected: { head: "a".repeat(40), branch: "main" },
    };
  return {
    ...base,
    authorization: { actions: [action], scope: { mode: "repository" } },
    target: {
      connectionKey: "github:primary",
      connectionRevision: 7,
      repositorySlug: "fixture-owner/fixture-repository",
      transport: "https",
      branch: "main",
      sourceOid: "a".repeat(40),
      remoteOid: "b".repeat(40),
    },
  };
}

function outcome(
  action: AssignedAction,
  status: GitWorkerResult["status"] = "succeeded",
): GitWorkerResult {
  const base = {
    ...emptyResult(),
    requestId: "assigned-worker-request",
    status,
  };
  if (action === "manage")
    return {
      ...base,
      action: "manage",
      details: {
        kind: "branch-create",
        name: "assigned-branch",
        head: "a".repeat(40),
      },
    };
  return {
    ...base,
    action,
    fetchedCommit: "b".repeat(40),
    trackingRef: action === "fetch" ? "refs/remotes/realize-sync/main" : null,
    syncStatus: status === "partial" ? "unknown" : "succeeded",
  };
}

function request(
  action: AssignedAction,
  overrides: Record<string, unknown> = {},
) {
  return {
    threadId: "assigned-thread",
    turnId: "assigned-turn",
    callId: "assigned-call",
    tool: `git_${action}`,
    arguments: {},
    ...overrides,
  };
}

function bind(capability: GitWorkerCapabilityService) {
  capability.threadId = "assigned-thread";
  capability.turnId = "assigned-turn";
}

function denied(error: unknown): boolean {
  return (
    error instanceof PolicyError && error.code === "worker_capability_denied"
  );
}

for (const action of actions) {
  test(`${action} capability открывает один назначенный tool и сохраняет caller context независимо от мутаций`, async () => {
    const assigned = context(action);
    const expected = structuredClone(assigned);
    const result = outcome(action);
    const capability = new GitWorkerCapabilityService(
      { action },
      assigned,
      async (command, received) => {
        assert.deepEqual(command, { action });
        assert.deepEqual(received, expected);
        return result;
      },
    );
    bind(capability);
    assigned.projectId = "changed-project";
    if ("target" in assigned) assigned.target.branch = "changed-branch";
    else if (assigned.operation.kind === "branch-create")
      assigned.operation.name = "changed-branch";
    assert.deepEqual(
      capability.tools.map((tool) => tool.name),
      [`git_${action}`],
    );
    assert.deepEqual(capability.tools[0]!.inputSchema, {
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    const tools = JSON.stringify(capability.tools);
    assert.equal(tools.includes("fixture-owner"), false);
    assert.equal(tools.includes("connectionRevision"), false);
    assert.equal(await capability.getResult(), null);
    assert.deepEqual(
      await capability.handle("item/tool/call", request(action)),
      {
        contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
        success: true,
      },
    );
    assert.strictEqual(await capability.getResult(), result);
    assert.equal(capability.calls, 1);
  });

  test(`${action} capability не принимает аргументы модели, чужой tool, namespace и несвязанную turn`, async (t) => {
    for (const [name, overrides] of [
      [
        "arguments",
        { arguments: { branch: "foreign", force: true, operation: "reset" } },
      ],
      ["wrong-tool", { tool: action === "fetch" ? "git_pull" : "git_fetch" }],
      ["inspect-tool", { tool: "git_inspect" }],
      ["namespace", { namespace: "foreign-plugin" }],
      ["turn", { turnId: "foreign-turn" }],
      ["thread", { threadId: "foreign-thread" }],
    ] as const)
      await t.test(name, async () => {
        const capability = new GitWorkerCapabilityService(
          { action },
          context(action),
          async () => assert.fail("Запрещённый запрос не вызывает handler."),
        );
        bind(capability);
        await assert.rejects(
          capability.handle("item/tool/call", request(action, overrides)),
          denied,
        );
        await assert.rejects(
          capability.handle("item/tool/call", request(action)),
          denied,
        );
        assert.equal(capability.calls, 0);
        assert.equal(capability.violation, true);
        assert.equal(await capability.getResult(), null);
      });
  });

  test(`${action} concurrent и повторный вызовы memoized, getResult хранит actual partial outcome`, async () => {
    const pending = Promise.withResolvers<GitWorkerResult>();
    const result = outcome(action, "partial");
    let deliveries = 0;
    const capability = new GitWorkerCapabilityService(
      { action },
      context(action),
      async () => {
        deliveries++;
        return pending.promise;
      },
    );
    bind(capability);
    const first = capability.handle("item/tool/call", request(action));
    const second = capability.handle(
      "item/tool/call",
      request(action, { callId: "second-call" }),
    );
    assert.equal(deliveries, 1);
    pending.resolve(result);
    const responses = await Promise.all([first, second]);
    assert.deepEqual(responses[0], responses[1]);
    assert.deepEqual(responses[0], {
      contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
      success: false,
    });
    assert.deepEqual(
      await capability.handle(
        "item/tool/call",
        request(action, { callId: "third-call" }),
      ),
      responses[0],
    );
    await capability.drain();
    assert.strictEqual(await capability.getResult(), result);
    assert.equal(deliveries, 1);
    assert.equal(capability.calls, 1);
  });

  test(`${action} parser отвергает message и неизвестные поля до deliver`, () => {
    assert.deepEqual(parseGitWorkerCommand({ action }), { action });
    for (const command of [
      { action, message: "unexpected" },
      { action, message: undefined },
      { action, target: { branch: "foreign" } },
      { action, authorization: { actions: [action] } },
    ]) {
      assert.throws(() => parseGitWorkerCommand(command), PolicyError);
      assert.throws(
        () =>
          new GitWorkerCapabilityService(
            command as never,
            context(action),
            async () => assert.fail("Parser должен остановить запуск."),
          ),
        PolicyError,
      );
    }
    const wrongContext = context(action === "fetch" ? "pull" : "fetch");
    assert.throws(
      () =>
        new GitWorkerCapabilityService({ action }, wrongContext, async () =>
          assert.fail("Разрешение другого действия не запускает handler."),
        ),
      PolicyError,
    );
  });
}

test("settings загружает только новый назначенный профиль; недопустимый action не выбирает файл", async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), "realize-assigned-settings-fixture-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const profiles = join(root, ".codex/agents/delivery/git");
  const prompts = join(root, ".codex/prompts/workflows/delivery/git");
  await mkdir(profiles, { recursive: true });
  await mkdir(prompts, { recursive: true });
  for (const action of actions) {
    await writeFile(
      join(profiles, `${action}.json`),
      JSON.stringify({
        model: "fixture-model",
        reasoningEffort: "low",
        timeoutMs: 5000,
      }),
    );
    await writeFile(
      join(prompts, `${action}.md`),
      `Fixture-only ${action} instructions`,
    );
    const settings = await loadGitWorkerSettings(root, action);
    assert.equal(settings.instructions, `Fixture-only ${action} instructions`);
    assert.equal(settings.model, "fixture-model");
  }
  await assert.rejects(
    loadGitWorkerSettings(root, "../../foreign" as never),
    (error: unknown) =>
      error instanceof PolicyError &&
      error.code === "worker_action_unavailable",
  );
});
