/**
 * @file .ai/tools/git-delivery/test/runGitWorker.service.test.ts
 * @version 1.2.1
 * @date 2026-10-23
 * @description Проверяет ограничения и завершение модельного оркестратора через управляемый транспорт без Git и Codex.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Context, Result } from "../src/contracts.ts";
import type {
  GitWorkerCommand,
  GitWorkerDependencies,
  GitWorkerSettings,
  GitWorkerTransport,
} from "../src/worker/GitWorker.types.ts";
import { runGitWorker } from "../src/worker/runGitWorker.service.ts";

const threadId = "fixture-thread";
const turnId = "fixture-turn";
const toolCall = {
  threadId,
  turnId,
  callId: "fixture-call",
  namespace: null,
  tool: "git_commit",
  arguments: {},
};
const completedEvent = {
  method: "turn/completed",
  params: { threadId, turn: { id: turnId, status: "completed" } },
};

function createHarness(action: "inspect" | "commit" = "commit") {
  const command: GitWorkerCommand =
    action === "inspect"
      ? { action }
      : {
          action,
          message: "docs: тестовое сообщение\n\nТочная вторая строка.",
        };
  const context: Context = {
    version: 1,
    requestId: "fixture-request",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: "/fixture/repository",
    authorization: { actions: [action], scope: { mode: "all" } },
    ...(action === "commit"
      ? {
          identity: { name: "Fixture", email: "fixture@example.test" },
          verification: {
            inputPaths: [],
            requiredChecks: ["content-review"],
            results: [
              {
                id: "content-review",
                status: "passed" as const,
                fingerprint: "b".repeat(64),
              },
            ],
          },
        }
      : {}),
  };
  const settings: GitWorkerSettings = {
    model: "fixture-model",
    reasoningEffort: "low",
    timeoutMs: 5_000,
    instructions: "Инструкция тестового воркера.",
  };
  const result: Result = {
    version: 1,
    requestId: context.requestId,
    action,
    status: "succeeded",
    branch: "fixture-branch",
    commit: "a".repeat(40),
    commitCreated: action === "commit",
    pushStatus: "not_requested",
    changes: { items: [{ path: "owned.txt", status: " M" }], truncated: false },
    fingerprint: "b".repeat(64),
    checks: [],
    errorCode: null,
    summary: "Тестовый снимок обработчика.",
    retryable: false,
  };
  const counts = { created: 0, started: 0, closed: 0, delivered: 0 };
  const requests: { method: string; params?: Record<string, unknown> }[] = [];
  const notifications: { method: string; params?: Record<string, unknown> }[] =
    [];
  const closed = Promise.withResolvers<void>();
  let transportOptions:
    Parameters<GitWorkerDependencies["createTransport"]>[0] | undefined;

  const driver = {
    closeError: null as Error | null,
    async reply(
      method: string,
      _params?: Record<string, unknown>,
    ): Promise<unknown> {
      switch (method) {
        case "initialize":
          return {};
        case "model/list":
          return { data: [{ model: settings.model }], nextCursor: null };
        case "config/read":
          return { config: { mcp_servers: { fixture: { enabled: true } } } };
        case "thread/start":
          return {
            model: settings.model,
            modelProvider: "openai",
            cwd: context.repositoryRoot,
            approvalPolicy: "never",
            sandbox: { type: "readOnly", networkAccess: false },
            thread: { id: threadId, ephemeral: true },
          };
        case "mcpServerStatus/list":
          return { data: [], nextCursor: null };
        case "turn/start":
          return { turn: { id: turnId } };
        default:
          throw new Error("Неожиданный RPC в тестовом сценарии.");
      }
    },
    events: (): ReturnType<GitWorkerTransport["getNotifications"]> =>
      (async function* () {
        yield completedEvent;
      })(),
  };
  const dependencies: GitWorkerDependencies = {
    createTransport(options) {
      transportOptions = options;
      counts.created += 1;
      return {
        start() {
          counts.started += 1;
        },
        async request<T = unknown>(
          method: string,
          params?: Record<string, unknown>,
        ): Promise<T> {
          requests.push({ method, params });
          return (await driver.reply(method, params)) as T;
        },
        notify(method, params) {
          notifications.push({ method, params });
        },
        getNotifications() {
          return driver.events();
        },
        async close() {
          counts.closed += 1;
          closed.resolve();
          if (driver.closeError) throw driver.closeError;
        },
      };
    },
    async deliver(receivedCommand, receivedContext) {
      counts.delivered += 1;
      assert.deepEqual(receivedCommand, command);
      assert.deepEqual(receivedContext, context);
      return result;
    },
  };
  const runtime = () => {
    assert.ok(
      transportOptions,
      "Транспорт должен быть создан до обращения сервера.",
    );
    return transportOptions;
  };
  return {
    command,
    context,
    settings,
    result,
    counts,
    requests,
    notifications,
    closed,
    driver,
    dependencies,
    runtime,
    run: (signal?: AbortSignal) =>
      runGitWorker(command, context, settings, dependencies, signal),
    serverRequest: (method: string, params: unknown) =>
      runtime().onRequest(method, params),
  };
}

test("inspect отклоняется до создания транспорта и запроса модели", async () => {
  const harness = createHarness("inspect");
  const report = await harness.run();
  assert.equal(report.status, "blocked");
  assert.equal(report.errorCode, "worker_action_unavailable");
  assert.equal(report.result, null);
  assert.equal(report.worker.threadId, null);
  assert.equal(report.worker.turnId, null);
  assert.equal(report.worker.handlerCalls, 0);
  assert.deepEqual(harness.requests, []);
  assert.deepEqual(harness.notifications, []);
  assert.deepEqual(harness.counts, {
    created: 0,
    started: 0,
    closed: 0,
    delivered: 0,
  });
});

test("commit_push отклоняется до создания транспорта", async () => {
  const harness = createHarness();
  const report = await runGitWorker(
    { action: "commit_push" },
    harness.context,
    harness.settings,
    harness.dependencies,
  );
  assert.equal(report.status, "blocked");
  assert.equal(report.errorCode, "worker_action_unavailable");
  assert.deepEqual(harness.counts, {
    created: 0,
    started: 0,
    closed: 0,
    delivered: 0,
  });
});

test("отсутствующая модель не запускает thread", async () => {
  const harness = createHarness();
  const reply = harness.driver.reply;
  harness.driver.reply = async (method, params) =>
    method === "model/list"
      ? { data: [{ model: "another-model" }], nextCursor: null }
      : reply(method, params);
  const report = await harness.run();
  assert.equal(report.errorCode, "worker_model_unavailable");
  assert.equal(
    harness.requests.some((request) => request.method === "thread/start"),
    false,
  );
  assert.equal(harness.counts.closed, 1);
});

test("подмена модели в созданном thread блокирует turn", async () => {
  const harness = createHarness();
  const reply = harness.driver.reply;
  harness.driver.reply = async (method, params) => {
    const response = await reply(method, params);
    return method === "thread/start"
      ? { ...(response as object), model: "substituted-model" }
      : response;
  };
  const report = await harness.run();
  assert.equal(report.errorCode, "worker_configuration_mismatch");
  assert.equal(
    harness.requests.some((request) => request.method === "turn/start"),
    false,
  );
  assert.equal(harness.counts.delivered, 0);
  assert.equal(harness.counts.closed, 1);
});

test("активные MCP-инструменты блокируются до turn даже после запроса отключения", async () => {
  const harness = createHarness();
  const reply = harness.driver.reply;
  harness.driver.reply = async (method, params) =>
    method === "mcpServerStatus/list"
      ? {
          data: [{ name: "fixture", tools: { read_external: {} } }],
          nextCursor: null,
        }
      : reply(method, params);
  const report = await harness.run();
  const thread = harness.requests.find(
    (request) => request.method === "thread/start",
  );
  assert.deepEqual(
    (thread?.params?.config as Record<string, unknown>).mcp_servers,
    { fixture: { enabled: false } },
  );
  assert.equal(report.errorCode, "worker_tools_unavailable");
  assert.equal(
    harness.requests.some((request) => request.method === "turn/start"),
    false,
  );
  assert.equal(harness.counts.closed, 1);
});

test("текстовый финал без вызова обработчика не считается результатом commit", async () => {
  const harness = createHarness();
  harness.driver.events = () =>
    (async function* () {
      yield {
        method: "item/completed",
        params: {
          threadId,
          turnId,
          item: {
            type: "agentMessage",
            text: "Все изменения успешно проверены.",
          },
        },
      };
      yield completedEvent;
    })();
  const report = await harness.run();
  assert.equal(report.status, "blocked");
  assert.equal(report.errorCode, "worker_result_missing");
  assert.equal(report.result, null);
  assert.equal(report.worker.handlerCalls, 0);
  assert.equal(harness.counts.closed, 1);
});

test("подтверждённый tool возвращает точный Result, usage и вызывает handler один раз", async () => {
  const harness = createHarness();
  harness.driver.events = () =>
    (async function* () {
      yield {
        method: "item/started",
        params: { threadId, turnId, item: { type: "userMessage" } },
      };
      yield {
        method: "item/completed",
        params: { threadId, turnId, item: { type: "userMessage" } },
      };
      const replies = await Promise.all([
        harness.serverRequest("item/tool/call", toolCall),
        harness.serverRequest("item/tool/call", {
          ...toolCall,
          callId: "repeated-call",
        }),
      ]);
      assert.deepEqual(replies[0], {
        contentItems: [
          { type: "inputText", text: JSON.stringify(harness.result) },
        ],
        success: true,
      });
      assert.deepEqual(replies[1], replies[0]);
      yield {
        method: "thread/tokenUsage/updated",
        params: {
          threadId,
          tokenUsage: {
            total: { inputTokens: 25, cachedInputTokens: 5, outputTokens: 3 },
          },
        },
      };
      yield completedEvent;
    })();
  const report = await harness.run();
  assert.equal(report.status, "succeeded");
  assert.equal(report.errorCode, null);
  assert.equal(report.result, harness.result);
  assert.deepEqual(report.worker.usage, {
    inputTokens: 25,
    cachedInputTokens: 5,
    outputTokens: 3,
  });
  assert.equal(report.worker.threadId, threadId);
  assert.equal(report.worker.turnId, turnId);
  assert.equal(report.worker.handlerCalls, 1);
  assert.equal(
    report.worker.instructionBytes,
    Buffer.byteLength(harness.settings.instructions),
  );
  const thread = harness.requests.find(
    (request) => request.method === "thread/start",
  );
  assert.equal(thread?.params?.baseInstructions, harness.settings.instructions);
  assert.equal(thread?.params?.developerInstructions, "");
  assert.deepEqual(harness.counts, {
    created: 1,
    started: 1,
    closed: 1,
    delivered: 1,
  });
  assert.deepEqual(harness.notifications, [
    { method: "initialized", params: undefined },
  ]);
});

test("ошибка закрытия транспорта сохраняет начавшийся commit и безопасный отчёт", async () => {
  const harness = createHarness("commit");
  const started = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<Result>();
  let toolResult: Promise<unknown> | undefined;
  harness.driver.closeError = new Error("private cleanup details");
  harness.dependencies.deliver = async () => {
    harness.counts.delivered += 1;
    started.resolve();
    return completed.promise;
  };
  harness.driver.events = () =>
    (async function* () {
      toolResult = harness.runtime().onRequest("item/tool/call", {
        ...toolCall,
        tool: "git_commit",
      });
      await started.promise;
      throw new Error("private transport failure");
    })();
  const operation = harness.run();
  await harness.closed.promise;
  completed.resolve(harness.result);
  const report = await operation;
  await toolResult;
  assert.equal(report.status, "failed");
  assert.equal(report.errorCode, "worker_transport_failed");
  assert.strictEqual(report.result, harness.result);
  assert.equal(report.result.commitCreated, true);
  assert.equal(report.worker.handlerCalls, 1);
  assert.equal(harness.counts.closed, 1);
  assert.ok(!JSON.stringify(report).includes("private"));
});

test("отказ cleanup после успешного tool не теряет подтверждённый результат", async () => {
  const harness = createHarness();
  harness.driver.closeError = new Error("private cleanup details");
  harness.driver.events = () =>
    (async function* () {
      await harness.runtime().onRequest("item/tool/call", toolCall);
      yield completedEvent;
    })();
  const report = await harness.run();
  assert.equal(report.status, "failed");
  assert.equal(report.errorCode, "worker_transport_cleanup_failed");
  assert.strictEqual(report.result, harness.result);
  assert.equal(report.worker.handlerCalls, 1);
  assert.equal(harness.counts.closed, 1);
  assert.ok(!JSON.stringify(report).includes("private"));
});

test("аргументы server request за пределами назначенного commit не доходят до handler", async () => {
  const harness = createHarness();
  harness.driver.events = () =>
    (async function* () {
      await assert.rejects(
        harness.serverRequest("item/tool/call", {
          ...toolCall,
          arguments: { action: "commit" },
        }),
        { code: "worker_capability_denied" },
      );
      yield completedEvent;
    })();
  const report = await harness.run();
  assert.equal(report.errorCode, "worker_capability_denied");
  assert.equal(harness.counts.delivered, 0);
  assert.equal(harness.counts.closed, 1);
});

test(
  "неизвестный server request до turn получает отказ без ожидания turnReady",
  { timeout: 1_000 },
  async () => {
    const harness = createHarness();
    const reply = harness.driver.reply;
    let deniedDuringInitialize = false;
    harness.driver.reply = async (method, params) => {
      if (method === "initialize") {
        await assert.rejects(
          harness.serverRequest("account/auth/refresh", {}),
          { code: "worker_capability_denied" },
        );
        deniedDuringInitialize = true;
      }
      return reply(method, params);
    };
    const report = await harness.run();
    assert.equal(deniedDuringInitialize, true);
    assert.equal(report.errorCode, "worker_capability_denied");
    assert.equal(harness.counts.delivered, 0);
    assert.equal(harness.counts.closed, 1);
  },
);

test(
  "отмена закрывает модель и сохраняет начавшийся commit до возврата отчёта",
  { timeout: 1_000 },
  async () => {
    const harness = createHarness("commit");
    const controller = new AbortController();
    const handlerStarted = Promise.withResolvers<void>();
    const handlerResult = Promise.withResolvers<Result>();
    let toolResponse: Promise<unknown> | undefined;
    harness.dependencies.deliver = async () => {
      harness.counts.delivered += 1;
      handlerStarted.resolve();
      return handlerResult.promise;
    };
    harness.driver.events = () =>
      (async function* () {
        const aborted = Promise.withResolvers<void>();
        const signal = harness.runtime().signal;
        signal.addEventListener("abort", () => aborted.resolve(), {
          once: true,
        });
        toolResponse = harness.serverRequest("item/tool/call", {
          ...toolCall,
          tool: "git_commit",
        });
        await aborted.promise;
        throw new Error("Тестовый транспорт прерван.");
      })();
    let settled = false;
    const running = harness.run(controller.signal).then((report) => {
      settled = true;
      return report;
    });
    await handlerStarted.promise;
    controller.abort();
    await harness.closed.promise;
    await Promise.resolve();
    assert.equal(settled, false);
    handlerResult.resolve(harness.result);
    const report = await running;
    await toolResponse;
    assert.equal(report.status, "blocked");
    assert.equal(report.errorCode, "worker_cancelled");
    assert.equal(report.result, harness.result);
    assert.equal(report.result?.commitCreated, true);
    assert.deepEqual(report.command, harness.command);
    assert.equal(report.worker.handlerCalls, 1);
    assert.equal(harness.counts.closed, 1);
  },
);

test("неполный контекст commit отклоняется до создания транспорта", async () => {
  const harness = createHarness("commit");
  delete harness.context.verification;
  const report = await harness.run();
  assert.equal(report.errorCode, "checks_required");
  assert.equal(harness.counts.created, 0);
});

test("commit сохраняет команду и различает успех, повтор и частичный результат", async (t) => {
  for (const status of ["succeeded", "noop", "partial"] as const) {
    await t.test(status, async () => {
      const harness = createHarness("commit");
      harness.result.status = status;
      if (status === "partial") harness.result.errorCode = "commit_mismatch";
      harness.driver.events = () =>
        (async function* () {
          yield {
            method: "item/started",
            params: {
              threadId,
              turnId,
              item: { type: "dynamicToolCall", tool: "git_commit" },
            },
          };
          await harness.serverRequest("item/tool/call", {
            ...toolCall,
            tool: "git_commit",
          });
          yield completedEvent;
        })();
      const report = await harness.run();
      assert.equal(
        report.status,
        status === "partial" ? "failed" : "succeeded",
      );
      assert.equal(report.result, harness.result);
      assert.deepEqual(report.command, harness.command);
      const turn = harness.requests.find(
        (request) => request.method === "turn/start",
      );
      assert.equal(
        (turn?.params?.input as { text: string }[])[0].text,
        JSON.stringify(harness.command),
      );
      assert.equal(harness.counts.closed, 1);
    });
  }
});

test("сбой транспорта закрывает созданного клиента и не раскрывает исходную ошибку", async () => {
  const harness = createHarness();
  harness.driver.reply = async () => {
    throw new Error("private transport detail");
  };
  const report = await harness.run();
  assert.equal(report.errorCode, "worker_transport_failed");
  assert.equal(
    JSON.stringify(report).includes("private transport detail"),
    false,
  );
  assert.deepEqual(harness.counts, {
    created: 1,
    started: 1,
    closed: 1,
    delivered: 0,
  });
});

test("запрещённый item/completed блокируется даже без item/started", async () => {
  const harness = createHarness();
  harness.driver.events = () =>
    (async function* () {
      yield {
        method: "item/completed",
        params: {
          threadId,
          turnId,
          item: { type: "commandExecution", command: "forbidden" },
        },
      };
      yield completedEvent;
    })();
  const report = await harness.run();
  assert.equal(report.errorCode, "worker_capability_denied");
  assert.equal(harness.counts.delivered, 0);
  assert.equal(harness.counts.closed, 1);
});

test("turn/completed без threadId не подтверждает завершение текущей сессии", async () => {
  const harness = createHarness();
  harness.driver.events = () =>
    (async function* () {
      yield {
        method: "turn/completed",
        params: { turn: { id: turnId, status: "completed" } },
      };
    })();
  const report = await harness.run();
  assert.equal(report.status, "blocked");
  assert.equal(report.errorCode, "worker_turn_failed");
  assert.equal(harness.counts.closed, 1);
});
