/**
 * @file .ai/tools/git-delivery/src/worker/runGitWorker.service.ts
 * @version 2.0.1
 * @date 2026-11-08
 * @description Ведёт ограниченную сессию Git-воркера и возвращает фактический результат Git-операции.
 */
import { PolicyError } from "@realize/git-runtime";

import { parseGitWorkerCommand } from "./parseGitWorkerCommand.validator.ts";
import { GitWorkerCapabilityService } from "./GitWorkerCapability.service.ts";
import { GIT_WORKER_CONFIG } from "./gitWorker.config.ts";
import type {
  GitWorkerDependencies,
  GitWorkerContext,
  GitWorkerReport,
  GitWorkerSettings,
  GitWorkerTransport,
} from "./GitWorker.types.ts";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

async function requireModel(
  client: GitWorkerTransport,
  model: string,
): Promise<void> {
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const response = record(
      await client.request("model/list", { limit: 100, cursor }),
    );
    if (
      Array.isArray(response.data) &&
      response.data.some((item) => record(item).model === model)
    )
      return;
    if (typeof response.nextCursor !== "string" || !response.nextCursor) break;
    cursor = response.nextCursor;
  }
  throw new PolicyError(
    "worker_model_unavailable",
    "Настроенная модель отсутствует в каталоге Codex.",
  );
}

/** Модель ведёт назначенную операцию; inspect выполняет отдельный программный маршрут. */
export async function runGitWorker(
  input: unknown,
  context: GitWorkerContext,
  settings: GitWorkerSettings,
  dependencies: GitWorkerDependencies,
  externalSignal?: AbortSignal,
): Promise<GitWorkerReport> {
  const started = performance.now();
  const deadline = AbortSignal.timeout(settings.timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([deadline, externalSignal])
    : deadline;
  const report: GitWorkerReport = {
    version: 1,
    status: "blocked",
    errorCode: null,
    result: null,
    command: null,
    worker: {
      model: settings.model,
      threadId: null,
      turnId: null,
      durationMs: 0,
      handlerCalls: 0,
      instructionBytes: Buffer.byteLength(settings.instructions),
      usage: null,
    },
  };
  let client: GitWorkerTransport | undefined;
  let capability: GitWorkerCapabilityService | undefined;
  const turnReady = Promise.withResolvers<void>();
  let stopped = false;
  try {
    signal.throwIfAborted();
    const command = parseGitWorkerCommand(input);
    if (command.action === "inspect") {
      throw new PolicyError(
        "worker_action_unavailable",
        "Inspect выполняется без модельного воркера.",
      );
    }
    capability = new GitWorkerCapabilityService(
      { ...command, action: command.action },
      context,
      dependencies.deliver,
    );
    report.command = capability.command;
    const boundCapability = capability;
    client = await dependencies.createTransport({
      signal,
      onRequest: async (method, params) => {
        if (method !== "item/tool/call")
          return boundCapability.handle(method, params);
        await turnReady.promise;
        signal.throwIfAborted();
        if (stopped)
          throw new PolicyError("worker_cancelled", "Сессия уже завершена.");
        return boundCapability.handle(method, params);
      },
    });
    client.start();
    await client.request("initialize", {
      clientInfo: { name: "realize-git-worker", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    client.notify("initialized");
    await requireModel(client, settings.model);
    const effective = record(
      await client.request("config/read", {
        cwd: context.repositoryRoot,
        includeLayers: false,
      }),
    );
    if (!effective.config || typeof effective.config !== "object")
      throw new PolicyError(
        "worker_configuration_invalid",
        "Codex не вернул действующую конфигурацию.",
      );
    // Пустая таблица MCP не удаляет настройки из нижних слоёв Codex.
    const disabledMcp = Object.fromEntries(
      Object.keys(record(record(effective.config).mcp_servers)).map((name) => [
        name,
        { enabled: false },
      ]),
    );
    const thread = record(
      await client.request("thread/start", {
        model: settings.model,
        modelProvider: "openai",
        allowProviderModelFallback: false,
        cwd: context.repositoryRoot,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
        environments: [],
        selectedCapabilityRoots: [],
        baseInstructions: settings.instructions,
        // Явное пустое переопределение исключает инструкции из настроек среды.
        developerInstructions: "",
        config: { ...GIT_WORKER_CONFIG, mcp_servers: disabledMcp },
        dynamicTools: capability.tools,
      }),
    );
    const threadData = record(thread.thread);
    if (
      thread.model !== settings.model ||
      thread.modelProvider !== "openai" ||
      thread.cwd !== context.repositoryRoot ||
      typeof threadData.id !== "string" ||
      !threadData.id ||
      threadData.ephemeral !== true ||
      record(thread.sandbox).type !== "readOnly" ||
      record(thread.sandbox).networkAccess === true ||
      thread.approvalPolicy !== "never"
    ) {
      throw new PolicyError(
        "worker_configuration_mismatch",
        "Codex не подтвердил выбранную модель или режим чтения.",
      );
    }
    capability.threadId = report.worker.threadId = threadData.id;
    const servers = record(
      await client.request("mcpServerStatus/list", {
        threadId: threadData.id,
        limit: 100,
        detail: "toolsAndAuthOnly",
      }),
    );
    if (
      !Array.isArray(servers.data) ||
      servers.nextCursor ||
      servers.data.some(
        (server) => Object.keys(record(record(server).tools)).length > 0,
      )
    ) {
      throw new PolicyError(
        "worker_tools_unavailable",
        "Не подтверждено отключение посторонних инструментов.",
      );
    }
    const turn = record(
      await client.request("turn/start", {
        threadId: threadData.id,
        effort: settings.reasoningEffort,
        input: [
          {
            type: "text",
            text: JSON.stringify(capability.command),
            text_elements: [],
          },
        ],
      }),
    );
    const turnId = record(turn.turn).id;
    if (typeof turnId !== "string" || !turnId)
      throw new PolicyError(
        "worker_protocol_invalid",
        "Codex не вернул идентификатор запуска.",
      );
    capability.turnId = report.worker.turnId = turnId;
    turnReady.resolve();
    let completed = false;
    for await (const event of client.getNotifications()) {
      const params = event.params ?? {};
      if (capability.violation || event.method === "realize/securityViolation")
        throw new PolicyError(
          "worker_capability_denied",
          "Запрошен инструмент вне разрешённой операции.",
        );
      if (params.threadId && params.threadId !== capability.threadId)
        throw new PolicyError(
          "worker_protocol_invalid",
          "Получено событие другой сессии.",
        );
      if (params.turnId && params.turnId !== capability.turnId)
        throw new PolicyError(
          "worker_protocol_invalid",
          "Получено событие другого запуска.",
        );
      if (
        event.method === "item/started" ||
        event.method === "item/completed"
      ) {
        if (
          params.threadId !== capability.threadId ||
          params.turnId !== capability.turnId
        )
          throw new PolicyError(
            "worker_protocol_invalid",
            "Событие не связано с текущим запуском.",
          );
        const item = record(params.item);
        if (
          ![
            "userMessage",
            "reasoning",
            "agentMessage",
            "dynamicToolCall",
          ].includes(String(item.type)) ||
          (item.type === "dynamicToolCall" &&
            !capability.tools.some((tool) => tool.name === item.tool))
        ) {
          throw new PolicyError(
            "worker_capability_denied",
            "Воркер начал действие вне разрешённого инструмента.",
          );
        }
      }
      if (event.method === "thread/tokenUsage/updated") {
        const usage = record(record(params.tokenUsage).total);
        if (
          [
            usage.inputTokens,
            usage.cachedInputTokens,
            usage.outputTokens,
          ].every((value) => Number.isSafeInteger(value) && Number(value) >= 0)
        ) {
          report.worker.usage = {
            inputTokens: Number(usage.inputTokens),
            cachedInputTokens: Number(usage.cachedInputTokens),
            outputTokens: Number(usage.outputTokens),
          };
        }
      }
      if (event.method === "turn/completed") {
        const result = record(params.turn);
        if (
          params.threadId !== capability.threadId ||
          result.id !== turnId ||
          result.status !== "completed"
        )
          throw new PolicyError(
            "worker_turn_failed",
            "Сессия Git-воркера не завершилась успешно.",
          );
        completed = true;
        break;
      }
    }
    if (!completed || capability.violation)
      throw new PolicyError(
        "worker_turn_failed",
        "Завершение воркера не подтверждено.",
      );
    report.result = await capability.getResult();
    if (!report.result)
      throw new PolicyError(
        "worker_result_missing",
        "Воркер не вызвал обработчик; текст ответа не является результатом Git.",
      );
    report.status =
      report.result.status === "succeeded" || report.result.status === "noop"
        ? "succeeded"
        : report.result.status === "failed" ||
            report.result.status === "partial"
          ? "failed"
          : "blocked";
    report.errorCode = report.result.errorCode;
  } catch (error) {
    report.status =
      signal.aborted || error instanceof PolicyError ? "blocked" : "failed";
    report.errorCode = deadline.aborted
      ? "worker_timeout"
      : externalSignal?.aborted
        ? "worker_cancelled"
        : error instanceof PolicyError
          ? error.code
          : "worker_transport_failed";
  } finally {
    stopped = true;
    turnReady.resolve();
    try {
      await client?.close();
    } catch (error) {
      // Ошибка транспорта не отменяет уже начавшуюся Git-операцию и не скрывает её результат.
      report.status = "failed";
      report.errorCode ??=
        error instanceof PolicyError
          ? error.code
          : "worker_transport_cleanup_failed";
    }
    if (capability) {
      // Начавшаяся операция завершается по лимитам handler даже при обрыве модели.
      // Его результат сохраняется отдельно от статуса самого воркера.
      try {
        await capability.drain();
        report.result ??= await capability.getResult();
      } catch {
        report.errorCode ??= "worker_operation_failed";
      }
      report.worker.handlerCalls = capability.calls;
      report.command = capability.command;
    }
    report.worker.durationMs = Math.round(performance.now() - started);
  }
  return report;
}
