/**
 * @file .ai/tools/git-delivery/src/worker/GitWorkerCapability.service.ts
 * @version 1.4.0
 * @date 2026-10-13
 * @description Ограничивает инструменты Git-воркера назначенной операцией и сохраняет фактические результаты обработчика.
 */

import { parseCommand, PolicyError } from "../contracts.ts";
import type { Context } from "../contracts.ts";
import { parseGitWorkerCommand } from "./parseGitWorkerCommand.validator.ts";
import { GIT_ASSIGNED_OPERATION_TOOLS } from "./gitWorkerActions.constants.ts";
import type {
  GitWorkerCommand,
  GitWorkerContext,
  GitWorkerDependencies,
  GitWorkerResult,
} from "./GitWorker.types.ts";
import { validateGitWorkerContext } from "./validateGitWorkerContext.validator.ts";

function succeeded(result: GitWorkerResult): boolean {
  return result.status === "succeeded" || result.status === "noop";
}

function tool(name: string, description: string, message = false) {
  return {
    type: "function" as const,
    name,
    description,
    inputSchema: message
      ? {
          type: "object",
          properties: {
            message: { type: "string", minLength: 1, maxLength: 4096 },
          },
          required: ["message"],
          additionalProperties: false,
        }
      : { type: "object", properties: {}, additionalProperties: false },
  };
}

/** Модель управляет только разрешённым вызовом и, при необходимости, текстом commit. */
export class GitWorkerCapabilityService {
  threadId: string | null = null;
  turnId: string | null = null;
  calls = 0;
  violation = false;
  private effectiveCommand: GitWorkerCommand;
  private readonly needsMessage: boolean;
  private readonly context: GitWorkerContext;
  private readonly deliver: GitWorkerDependencies["deliver"];
  private inspection?: Promise<GitWorkerResult>;
  private inspectionResult: GitWorkerResult | null = null;
  private commit?: Promise<GitWorkerResult>;
  private push?: Promise<GitWorkerResult>;
  private assignedOperation?: Promise<GitWorkerResult>;

  constructor(
    command: GitWorkerCommand,
    context: GitWorkerContext,
    deliver: GitWorkerDependencies["deliver"],
  ) {
    const parsed = parseGitWorkerCommand(command);
    this.effectiveCommand = parsed;
    this.context = structuredClone(
      validateGitWorkerContext(parsed.action, context),
    );
    this.deliver = deliver;
    this.needsMessage =
      parsed.action === "commit" && parsed.message === undefined;
  }

  /** Копия включает эффективное сообщение; изменение полученного объекта не меняет операцию. */
  get command(): GitWorkerCommand {
    return { ...this.effectiveCommand };
  }

  /** Определения не открывают модели контекст вызывающей среды или выбор действия Git. */
  get tools() {
    const action = this.effectiveCommand.action;
    if (
      action === "manage" ||
      action === "fetch" ||
      action === "pull" ||
      action === "merge"
    ) {
      const assigned = GIT_ASSIGNED_OPERATION_TOOLS[action];
      return [tool(assigned.name, assigned.description)];
    }
    if (this.effectiveCommand.action === "push")
      return [
        tool(
          "git_push",
          "Отправляет назначенный набор коммитов в разрешённую ветку. Аргументы не требуются.",
        ),
      ];
    const inspect = tool(
      "git_inspect",
      "Получает сводку путей и статусов только назначенной области. Аргументы не требуются.",
    );
    if (this.effectiveCommand.action === "inspect") return [inspect];
    const commit = tool(
      "git_commit",
      this.needsMessage
        ? "После успешного git_inspect создаёт локальный commit с сообщением по полученной сводке."
        : "Создаёт локальный commit с назначенным сообщением. Аргументы не требуются.",
      this.needsMessage,
    );
    return this.needsMessage ? [inspect, commit] : [commit];
  }

  async handle(method: string, input: unknown): Promise<unknown> {
    if (this.violation) this.deny();
    const params =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const args = params.arguments;
    if (
      method !== "item/tool/call" ||
      (params.namespace !== null && params.namespace !== undefined) ||
      !this.threadId ||
      !this.turnId ||
      params.threadId !== this.threadId ||
      params.turnId !== this.turnId ||
      typeof params.callId !== "string" ||
      !params.callId ||
      !args ||
      typeof args !== "object" ||
      Array.isArray(args)
    ) {
      this.deny();
    }
    const fields = args as Record<string, unknown>;
    let operation: Promise<GitWorkerResult>;
    const action = this.effectiveCommand.action;
    if (
      (action === "manage" ||
        action === "fetch" ||
        action === "pull" ||
        action === "merge") &&
      params.tool === GIT_ASSIGNED_OPERATION_TOOLS[action].name
    ) {
      if (Object.keys(fields).length !== 0) this.deny();
      this.assignedOperation ??= this.execute(
        this.effectiveCommand,
        this.context,
      );
      operation = this.assignedOperation;
    } else if (
      params.tool === "git_push" &&
      this.effectiveCommand.action === "push"
    ) {
      if (Object.keys(fields).length !== 0) this.deny();
      this.push ??= this.execute(this.effectiveCommand, this.context);
      operation = this.push;
    } else if (
      params.tool === "git_inspect" &&
      (this.effectiveCommand.action === "inspect" || this.needsMessage)
    ) {
      if (Object.keys(fields).length !== 0) this.deny();
      this.inspection ??= this.inspect();
      operation = this.inspection;
    } else if (
      params.tool === "git_commit" &&
      this.effectiveCommand.action === "commit"
    ) {
      if (this.needsMessage) {
        if (
          Object.keys(fields).length !== 1 ||
          !Object.hasOwn(fields, "message")
        )
          this.deny();
        let command: GitWorkerCommand;
        try {
          command = parseCommand({
            action: "commit",
            message: fields.message,
          }) as GitWorkerCommand;
          if (command.message === undefined) this.deny();
        } catch {
          this.deny();
        }
        // Незавершённый preview не может отложить начало записи до момента после отмены сессии.
        if (!this.inspectionResult || !succeeded(this.inspectionResult))
          this.deny();
        if (
          this.effectiveCommand.message !== undefined &&
          command.message !== this.effectiveCommand.message
        )
          this.deny();
        this.effectiveCommand = command;
      } else if (Object.keys(fields).length !== 0) {
        this.deny();
      }
      this.commit ??= this.execute(this.effectiveCommand, this.context);
      operation = this.commit;
    } else {
      this.deny();
    }
    const result = await operation;
    return {
      contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
      success: succeeded(result),
    };
  }

  /** Успешный preview не является результатом commit; отказ preview остаётся доступным как блокер. */
  async getResult(): Promise<GitWorkerResult | null> {
    if (this.assignedOperation) return await this.assignedOperation;
    if (this.push) return await this.push;
    if (this.commit) return await this.commit;
    if (!this.inspection) return null;
    const preview = await this.inspection;
    return this.effectiveCommand.action === "inspect" || !succeeded(preview)
      ? preview
      : null;
  }

  /** Дожидается уже начавшихся вызовов; результат и ошибки читает getResult, новые запросы закрывает orchestrator. */
  async drain(): Promise<void> {
    await Promise.allSettled([
      this.inspection,
      this.commit,
      this.push,
      this.assignedOperation,
    ]);
  }

  private async inspect(): Promise<GitWorkerResult> {
    if ("target" in this.context || "operation" in this.context) this.deny();
    const legacyContext = this.context as Context;
    const context =
      this.effectiveCommand.action === "inspect"
        ? this.context
        : validateGitWorkerContext("inspect", {
            version: legacyContext.version,
            requestId: legacyContext.requestId,
            projectId: legacyContext.projectId,
            taskId: legacyContext.taskId,
            repositoryRoot: legacyContext.repositoryRoot,
            authorization: {
              actions: ["inspect"],
              scope: legacyContext.authorization.scope,
            },
            verification: {
              inputPaths: legacyContext.verification!.inputPaths,
              requiredChecks: [],
              results: [],
            },
          });
    this.inspectionResult = await this.execute({ action: "inspect" }, context);
    return this.inspectionResult;
  }

  private async execute(
    command: GitWorkerCommand,
    context: GitWorkerContext,
  ): Promise<GitWorkerResult> {
    this.calls += 1;
    return this.deliver({ ...command }, context);
  }

  private deny(): never {
    this.violation = true;
    throw new PolicyError(
      "worker_capability_denied",
      "Воркер запросил действие вне назначенной операции Git.",
    );
  }
}
