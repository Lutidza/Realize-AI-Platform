/**
 * @file packages/codex-adapter/src/OpenAICodexAdapter.ts
 * @version 2.1.0
 * @date 2026-09-13
 * @description Выполняет изолированные сессии Codex App Server с выбранной политикой доступа.
 */

import type {
  AgentEvent,
  CodingAgentAdapter,
  RunTurnInput,
  ChatSourceDto,
  UsageSummary,
} from "@realize/ai-contracts";

import { JsonLineRPCClient } from "./JsonLineRpcClient.adapter";
import type {
  ActiveRun,
  CodexChatPermissions,
  CodexLocalImageInput,
  OpenAICodexAdapterOptions,
} from "./OpenAICodex.types";
import { codexRecord as asRecord } from "./codexRecord.util";
import { collectCodexChatSources } from "./collectCodexChatSources.mapper";
import { validateCodexImageInputs } from "./validateCodexImageInputs.validator";
import { createCodexChatPermissions } from "./createCodexChatPermissions.config";
import { CodexReadTools } from "./CodexReadTools.adapter";
import type {
  RPCMessage,
  ThreadStartResult,
  TokenUsage,
  TurnStartResult,
} from "./protocol";

export type { OpenAICodexAdapterOptions } from "./OpenAICodex.types";

const readTokenUsage = (message: RPCMessage): UsageSummary | undefined => {
  const params = message.params;
  const tokenUsage = asRecord(params?.tokenUsage);
  const last = asRecord(tokenUsage?.last) as TokenUsage | undefined;
  if (!last) return undefined;

  return {
    cachedInputTokens: Number(last.cachedInputTokens || 0),
    inputTokens: Number(last.inputTokens || 0),
    outputTokens: Number(last.outputTokens || 0),
    totalTokens: Number(last.totalTokens || 0),
  };
};

const finalMessageFromTurn = (turn: Record<string, unknown>): string => {
  const items = Array.isArray(turn.items) ? turn.items : [];
  const message = [...items]
    .reverse()
    .map(asRecord)
    .find(
      (item) => item?.type === "agentMessage" && typeof item.text === "string",
    );

  return typeof message?.text === "string" ? message.text : "";
};

/** Выполняет сессии с выбранной политикой доступа и нормализует уведомления App Server. */
export class OpenAICodexAdapter implements CodingAgentAdapter {
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(private readonly options: OpenAICodexAdapterOptions) {}

  async cancelRun(runID: string): Promise<void> {
    const active = this.activeRuns.get(runID);
    if (!active) return;

    try {
      await active.client.request("turn/interrupt", {
        threadId: active.threadID,
        turnId: active.turnID,
      });
    } catch {
      await active.client.close();
    }
  }

  async *runTurn(input: RunTurnInput): AsyncIterable<AgentEvent> {
    if (this.activeRuns.has(input.runID))
      throw new Error("Run is already active.");

    const webSearch =
      input.webSearch === true && input.sandboxProfile === "analysis-readonly";
    if (
      this.options.readTools &&
      input.sandboxProfile !== "analysis-readonly"
    ) {
      yield {
        type: "run.failed",
        message: "Инструменты чтения разрешены только для аналитического чата.",
      };
      return;
    }
    if (input.webSearch === true && !webSearch) {
      yield {
        type: "run.failed",
        message: "Веб-поиск разрешён только для аналитического чата.",
      };
      return;
    }
    let images: CodexLocalImageInput[];
    let chatPermissions: CodexChatPermissions | undefined;
    let readTools: CodexReadTools | undefined;
    try {
      if (this.options.readTools)
        readTools = new CodexReadTools(this.options.readTools);
      images = await validateCodexImageInputs(input.cwd, input.images);
      if (input.sandboxProfile === "analysis-readonly")
        chatPermissions = await createCodexChatPermissions(
          input.cwd,
          this.options,
        );
    } catch {
      yield {
        type: "run.failed",
        message:
          "Файловый контекст чата недоступен или не соответствует политике изоляции.",
      };
      return;
    }

    const client = new JsonLineRPCClient({
      codexBinary: chatPermissions?.binaryPath ?? this.options.codexBinary,
      environment: this.options.environment,
      signal: this.options.signal,
      ...(readTools
        ? { onRequest: readTools.handleRequest.bind(readTools) }
        : {}),
      workingDirectory: input.cwd,
      webSearch: webSearch ? "live" : "disabled",
    });
    client.start();

    let active: ActiveRun | undefined;
    let accumulatedMessage = "";
    let sources: ChatSourceDto[] = [];
    const writable = input.sandboxProfile === "code-workspace-write";
    const sandbox = writable ? "workspace-write" : "read-only";
    const machineCredential = Boolean(
      this.options.environment?.CODEX_ACCESS_TOKEN ||
      this.options.environment?.OPENAI_FEDERATION_RULE_ID,
    );
    // WIF использует профиль с запретом чтения каталога assertion для любого инструмента.
    const permissions = chatPermissions
      ? {
          config: {
            web_search: webSearch ? "live" : "disabled",
            default_permissions: "realize_chat_snapshot",
            permissions: { realize_chat_snapshot: chatPermissions.profile },
          },
        }
      : this.options.environment?.OPENAI_FEDERATION_RULE_ID
        ? {
            config: {
              web_search: webSearch ? "live" : "disabled",
              default_permissions: writable
                ? "realize_wif_workspace"
                : "realize_wif_readonly",
            },
          }
        : { sandbox, config: { web_search: webSearch ? "live" : "disabled" } };

    try {
      await client.request("initialize", {
        capabilities: readTools ? { experimentalApi: true } : null,
        clientInfo: {
          name: "realize-ai-control-plane",
          title: "Realize AI Control Plane",
          version: "0.1.0",
        },
      });
      client.notify("initialized");

      // Resume не заменяет сохранённые dynamicTools: каждый запуск с tools получает точный новый набор.
      const thread =
        input.threadID && !readTools
          ? await client.request<ThreadStartResult>("thread/resume", {
              approvalPolicy: "never",
              baseInstructions: null,
              cwd: input.cwd,
              developerInstructions: input.developerInstructions,
              model: input.model || null,
              ...permissions,
              threadId: input.threadID,
            })
          : await client.request<ThreadStartResult>("thread/start", {
              approvalPolicy: "never",
              cwd: input.cwd,
              developerInstructions: input.developerInstructions,
              ephemeral: input.ephemeral ?? false,
              model: input.model || null,
              ...(readTools ? { dynamicTools: readTools.definitions } : {}),
              ...permissions,
            });

      const turn = await client.request<TurnStartResult>("turn/start", {
        approvalPolicy: "never",
        input: [
          { text: input.prompt, text_elements: [], type: "text" },
          ...images,
        ],
        threadId: thread.thread.id,
      });

      active = {
        client,
        threadID: thread.thread.id,
        turnID: turn.turn.id,
      };
      readTools?.bind(active.threadID, active.turnID);
      this.activeRuns.set(input.runID, active);
      yield { threadID: active.threadID, type: "run.started" };

      for await (const message of client.getNotifications()) {
        const params = message.params || {};

        if (message.method === "realize/securityViolation") {
          await this.cancelRun(input.runID);
          yield {
            message:
              "Codex requested a capability forbidden by non-interactive worker policy.",
            type: "run.failed",
          };
          break;
        }

        if (
          message.method === "item/agentMessage/delta" &&
          typeof params.delta === "string"
        ) {
          accumulatedMessage += params.delta;
          yield { delta: params.delta, type: "assistant.delta" };
          continue;
        }

        if (message.method === "thread/tokenUsage/updated") {
          const usage = readTokenUsage(message);
          if (usage) yield { type: "usage.updated", usage };
          continue;
        }

        if (message.method === "item/started") {
          const item = asRecord(params.item);
          if (
            (!writable && item?.type === "fileChange") ||
            (!webSearch && item?.type === "webSearch") ||
            item?.type === "mcpToolCall" ||
            (item?.type === "dynamicToolCall" &&
              !readTools?.allowsItem(item, params.threadId, params.turnId))
          ) {
            await this.cancelRun(input.runID);
            yield {
              message: `Blocked forbidden tool type: ${String(item.type)}.`,
              type: "run.failed",
            };
            break;
          }
          if (item?.type === "commandExecution") {
            yield {
              summary: writable
                ? "Isolated implementation command started."
                : "Read-only repository inspection started.",
              type: "tool.started",
            };
          }
          if (item?.type === "webSearch") {
            yield {
              summary: "Поиск источников в интернете начат.",
              type: "tool.started",
            };
          }
          if (item?.type === "dynamicToolCall") {
            yield {
              type: "tool.started",
              summary: "Чтение данных CMS начато.",
            };
          }
          continue;
        }

        if (message.method === "item/completed") {
          const item = asRecord(params.item);
          if (
            (!writable && item?.type === "fileChange") ||
            (!webSearch && item?.type === "webSearch") ||
            item?.type === "mcpToolCall" ||
            (item?.type === "dynamicToolCall" &&
              !readTools?.allowsItem(item, params.threadId, params.turnId))
          ) {
            await this.cancelRun(input.runID);
            yield {
              message: `Blocked forbidden tool type: ${String(item.type)}.`,
              type: "run.failed",
            };
            break;
          }
          if (item?.type === "commandExecution") {
            yield {
              durationMs:
                typeof item.durationMs === "number"
                  ? item.durationMs
                  : undefined,
              status: item.status === "completed" ? "completed" : "failed",
              summary: writable
                ? "Isolated implementation command finished."
                : "Read-only repository inspection finished.",
              type: "tool.completed",
            };
          }
          if (webSearch) sources = collectCodexChatSources([item], sources);
          if (item?.type === "webSearch") {
            yield {
              summary: "Обращение к интернет-источникам завершено.",
              status: "completed",
              type: "tool.completed",
            };
          }
          if (item?.type === "dynamicToolCall") {
            yield {
              type: "tool.completed",
              status:
                item.status === "completed" && item.success === true
                  ? "completed"
                  : "failed",
              summary: "Чтение данных CMS завершено.",
            };
          }
          continue;
        }

        if (message.method === "turn/completed") {
          const turnResult = asRecord(params.turn) || {};
          const status = turnResult.status;

          if (status === "completed") {
            const items = Array.isArray(turnResult.items)
              ? turnResult.items
              : [];
            if (
              !webSearch &&
              items.some((item) => asRecord(item)?.type === "webSearch")
            ) {
              yield {
                type: "run.failed",
                message:
                  "Codex попытался использовать веб-поиск вне разрешённого режима.",
              };
              break;
            }
            if (
              items.some((value) => {
                const item = asRecord(value);
                return (
                  item?.type === "mcpToolCall" ||
                  (!writable && item?.type === "fileChange") ||
                  (item?.type === "dynamicToolCall" &&
                    !readTools?.allowsItem(
                      item,
                      params.threadId,
                      turnResult.id,
                    ))
                );
              })
            ) {
              yield {
                type: "run.failed",
                message:
                  "Codex использовал инструмент вне разрешённого набора.",
              };
              break;
            }
            const content =
              finalMessageFromTurn(turnResult) || accumulatedMessage;
            if (webSearch) sources = collectCodexChatSources(items, sources);
            yield {
              content,
              ...(sources.length ? { sources } : {}),
              type: "assistant.completed",
            };
          } else if (status === "interrupted") {
            yield { type: "run.cancelled" };
          } else {
            const error = asRecord(turnResult.error);
            yield {
              message: machineCredential
                ? "Не удалось выполнить запрос Codex. Проверьте подключение в разделе интеграций."
                : typeof error?.message === "string"
                  ? error.message
                  : "Codex run failed.",
              type: "run.failed",
            };
          }
          break;
        }
      }
    } catch (error) {
      yield {
        message: machineCredential
          ? "Не удалось выполнить запрос Codex. Проверьте подключение в разделе интеграций."
          : error instanceof Error
            ? error.message
            : "Codex adapter failed.",
        type: "run.failed",
      };
    } finally {
      readTools?.close();
      if (active) this.activeRuns.delete(input.runID);
      await client.close();
    }
  }
}
