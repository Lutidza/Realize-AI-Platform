/**
 * @file packages/codex-adapter/src/OpenAICodexAdapter.ts
 * @version 2.7.0
 * @date 2026-10-23
 * @description Выполняет изолированные сессии Codex App Server с выбранной политикой доступа.
 */

import type {
  AgentEvent,
  CodingAgentAdapter,
  RunTurnInput,
  ChatSourceDto,
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
import { createCodexOwnerHostEnvironment } from "./createCodexOwnerHostEnvironment.config";
import { CodexReadTools } from "./CodexReadTools.adapter";
import { CodexOwnerProjectMcpPolicy } from "./CodexOwnerProjectMcpPolicy.validator";
import { closeNativeSearchThreads } from "./closeNativeSearchThreads.service";
import { readCodexUsage } from "./readCodexUsage.mapper";
import type { ThreadStartResult, TurnStartResult } from "./protocol";

export type { OpenAICodexAdapterOptions } from "./OpenAICodex.types";

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

/** Дочерний thread и прежний turn не могут изменить результат текущего запуска. */
const matchesActiveTurn = (
  params: Record<string, unknown>,
  active: ActiveRun,
  turnID: unknown = params.turnId,
): boolean => params.threadId === active.threadID && turnID === active.turnID;

/** Выполняет сессии с выбранной политикой доступа и нормализует уведомления App Server. */
export class OpenAICodexAdapter implements CodingAgentAdapter {
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(private readonly options: OpenAICodexAdapterOptions) {}

  /** Исключение относится только к собственному listener одного run, с фиксированными read tools. */
  private allowsRepositoryMcp(item: Record<string, unknown>): boolean {
    return Boolean(
      this.options.repositoryMcpURL &&
      this.options.search?.enabled &&
      item.server === "realize_repository" &&
      typeof item.tool === "string" &&
      [
        "repo_search",
        "repo_read_file",
        "repo_list_files",
        "repo_git_head",
      ].includes(item.tool),
    );
  }

  async cancelRun(runID: string): Promise<void> {
    const active = this.activeRuns.get(runID);
    if (!active) return;
    if (active.ownerHost) active.cancelled = true;

    try {
      await active.client.request("turn/interrupt", {
        threadId: active.threadID,
        turnId: active.turnID,
      });
    } catch {
      await active.client.close();
    } finally {
      // У owner-host native commands и потомки не должны пережить подтверждённую отмену.
      if (active.ownerHost) await active.client.close();
    }
  }

  async *runTurn(input: RunTurnInput): AsyncIterable<AgentEvent> {
    if (this.activeRuns.has(input.runID))
      throw new Error("Run is already active.");

    const ownerHost = input.sandboxProfile === "owner-host";
    try {
      if (
        input.sandboxProfile !== undefined &&
        ![
          "analysis-readonly",
          "code-workspace-write",
          "review-readonly",
          "owner-host",
        ].includes(input.sandboxProfile)
      )
        throw new Error("codex_sandbox_profile_invalid");
      if (ownerHost) {
        if (this.options.readTools || this.options.repositoryMcpURL)
          throw new Error("codex_owner_host_tools_invalid");
        createCodexOwnerHostEnvironment(input.cwd, this.options.ownerHost);
      } else if (this.options.ownerHost) {
        throw new Error("codex_owner_host_profile_invalid");
      }
    } catch {
      yield {
        type: "run.failed",
        message: "Серверный допуск к выбранному режиму Codex недействителен.",
      };
      return;
    }

    const webSearch =
      input.webSearch === true &&
      (input.sandboxProfile === "analysis-readonly" || ownerHost);
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
        readTools = new CodexReadTools(
          this.options.readTools,
          Boolean(
            this.options.search?.enabled &&
            this.options.search.mode === "subagent",
          ),
        );
      images = await validateCodexImageInputs(
        ownerHost
          ? (this.options.ownerHost?.attachmentRoot ?? input.cwd)
          : input.cwd,
        input.images,
      );
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
      ignoreProjectInstructions: !ownerHost,
      ...(ownerHost ? { ownerHost: this.options.ownerHost } : {}),
      codexBinary: chatPermissions?.binaryPath ?? this.options.codexBinary,
      environment: this.options.environment,
      signal: this.options.signal,
      ...(readTools
        ? {
            onRequest: readTools.handleRequest.bind(readTools),
            onNotification: readTools.observeNotification.bind(readTools),
          }
        : {}),
      workingDirectory: input.cwd,
      webSearch: webSearch ? "live" : "disabled",
      search: this.options.search,
      repositoryMcpURL: this.options.repositoryMcpURL,
    });
    client.start();

    let active: ActiveRun | undefined;
    let ownerMcp: CodexOwnerProjectMcpPolicy | undefined;
    const allowsMcp = (item: Record<string, unknown>): boolean =>
      ownerMcp ? ownerMcp.allows(item) : this.allowsRepositoryMcp(item);
    const forbiddenToolMessage = (item: Record<string, unknown>): string =>
      ownerHost && item.type === "mcpToolCall"
        ? `Запрещён MCP-инструмент: ${CodexOwnerProjectMcpPolicy.label(item)}.`
        : `Blocked forbidden tool type: ${String(item.type)}.`;
    let accumulatedMessage = "";
    let sources: ChatSourceDto[] = [];
    const writable =
      ownerHost || input.sandboxProfile === "code-workspace-write";
    const sandbox = writable ? "workspace-write" : "read-only";
    const machineCredential = Boolean(
      this.options.environment?.CODEX_ACCESS_TOKEN ||
      this.options.environment?.OPENAI_FEDERATION_RULE_ID,
    );
    // Owner переопределяет named default интеграции штатным full-access builtin;
    // isolated WIF сохраняет запрет чтения каталога assertion.
    const permissions = ownerHost
      ? {
          config: {
            default_permissions: ":danger-full-access",
            web_search: webSearch ? "live" : "disabled",
          },
        }
      : chatPermissions
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
          : {
              sandbox,
              config: { web_search: webSearch ? "live" : "disabled" },
            };

    try {
      await client.request("initialize", {
        capabilities:
          readTools ||
          this.options.repositoryMcpURL ||
          (ownerHost &&
            this.options.search?.enabled &&
            this.options.search.mode === "subagent")
            ? { experimentalApi: true }
            : null,
        clientInfo: {
          name: "realize-ai-control-plane",
          title: "Realize AI Control Plane",
          version: "0.1.0",
        },
      });
      client.notify("initialized");

      if (ownerHost) {
        ownerMcp = new CodexOwnerProjectMcpPolicy(
          await client.request("config/read", {
            cwd: input.cwd,
            includeLayers: true,
          }),
          input.cwd,
          this.options.ownerHost?.trustedProjectMcp === true,
        );
      }

      // Resume сохраняет dynamicTools; owner-host начинает новый thread, чтобы не наследовать профиль чата.
      const thread =
        input.threadID && !readTools && !ownerHost
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
              ...(ownerMcp
                ? { config: { ...permissions.config, ...ownerMcp.config } }
                : {}),
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
        ...(ownerHost ? { ownerHost: true } : {}),
      };
      readTools?.bind(active.threadID, active.turnID);
      this.activeRuns.set(input.runID, active);
      yield { threadID: active.threadID, type: "run.started" };
      let observedModel: string | null = thread.model ?? input.model ?? null;
      let measurementSequence = 0;
      // Cumulative total старого thread включает предыдущие turns: без baseline не тарифицируем.
      const freshThread = ownerHost || !input.threadID || Boolean(readTools);
      // Full-host shell может запускать внешние model workers: parent counters не доказывают их учёт.
      const childUsagePossible =
        ownerHost ||
        (this.options.search?.enabled &&
          this.options.search.mode === "subagent");

      for await (const message of client.getNotifications()) {
        if (active.cancelled) break;
        const params = message.params || {};
        if (
          message.method === "model/rerouted" &&
          matchesActiveTurn(params, active)
        )
          observedModel = null;

        if (message.method === "realize/securityViolation") {
          if (ownerHost) await client.close();
          else await this.cancelRun(input.runID);
          yield {
            message:
              "Codex requested a capability forbidden by non-interactive worker policy.",
            type: "run.failed",
          };
          break;
        }

        if (
          message.method === "item/agentMessage/delta" &&
          typeof params.delta === "string" &&
          matchesActiveTurn(params, active)
        ) {
          accumulatedMessage += params.delta;
          yield { delta: params.delta, type: "assistant.delta" };
          continue;
        }

        if (message.method === "thread/tokenUsage/updated") {
          if (!matchesActiveTurn(params, active)) continue;
          const usage = asRecord(params.tokenUsage);
          const last = readCodexUsage(usage?.last);
          if (
            last &&
            last.inputTokens !== null &&
            last.cachedInputTokens !== null &&
            last.outputTokens !== null &&
            last.totalTokens !== null
          ) {
            yield {
              type: "usage.updated",
              usage: {
                inputTokens: last.inputTokens,
                cachedInputTokens: last.cachedInputTokens,
                outputTokens: last.outputTokens,
                totalTokens: last.totalTokens,
              },
            };
          }
          const total = freshThread ? readCodexUsage(usage?.total) : null;
          yield {
            type: "usage.measured",
            measurement: {
              measurementId: `${active.turnID}:${++measurementSequence}`,
              model: observedModel,
              providerThreadId: active.threadID,
              providerTurnId: active.turnID,
              tokens: total ?? {
                inputTokens: null,
                cachedInputTokens: null,
                outputTokens: null,
                reasoningOutputTokens: null,
                totalTokens: null,
              },
              coverage:
                total &&
                !childUsagePossible &&
                total.inputTokens !== null &&
                total.cachedInputTokens !== null &&
                total.outputTokens !== null
                  ? "turn"
                  : "partial",
            },
          };
          continue;
        }

        if (message.method === "item/started") {
          const item = asRecord(params.item);
          if (
            (!writable && item?.type === "fileChange") ||
            (!webSearch && item?.type === "webSearch") ||
            (item?.type === "mcpToolCall" && !allowsMcp(item)) ||
            (item?.type === "dynamicToolCall" &&
              !readTools?.allowsItem(item, params.threadId, params.turnId))
          ) {
            if (ownerHost) await client.close();
            else await this.cancelRun(input.runID);
            yield {
              message: forbiddenToolMessage(item),
              type: "run.failed",
            };
            break;
          }
          if (!matchesActiveTurn(params, active)) continue;
          if (item?.type === "commandExecution") {
            yield {
              summary: ownerHost
                ? "Команда владельца на локальной машине запущена."
                : writable
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
              summary: "Чтение разрешённых данных начато.",
            };
          }
          if (item?.type === "mcpToolCall" && allowsMcp(item)) {
            yield {
              type: "tool.started",
              summary: ownerHost
                ? `MCP ${CodexOwnerProjectMcpPolicy.label(item)}: вызов начат.`
                : item.tool === "repo_git_head"
                  ? "Чтение Git HEAD начато."
                  : "Поиск в файлах проекта начат.",
            };
          }
          if (
            item?.type === "collabAgentToolCall" &&
            item.tool === "spawnAgent"
          ) {
            yield { type: "tool.started", summary: "Поисковый агент запущен." };
          }
          continue;
        }

        if (message.method === "item/completed") {
          const item = asRecord(params.item);
          if (
            (!writable && item?.type === "fileChange") ||
            (!webSearch && item?.type === "webSearch") ||
            (item?.type === "mcpToolCall" && !allowsMcp(item)) ||
            (item?.type === "dynamicToolCall" &&
              !readTools?.allowsItem(item, params.threadId, params.turnId))
          ) {
            if (ownerHost) await client.close();
            else await this.cancelRun(input.runID);
            yield {
              message: forbiddenToolMessage(item),
              type: "run.failed",
            };
            break;
          }
          if (!matchesActiveTurn(params, active)) continue;
          if (item?.type === "commandExecution") {
            yield {
              durationMs:
                typeof item.durationMs === "number"
                  ? item.durationMs
                  : undefined,
              status: item.status === "completed" ? "completed" : "failed",
              summary: ownerHost
                ? "Команда владельца на локальной машине завершена."
                : writable
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
              summary: "Чтение разрешённых данных завершено.",
            };
          }
          if (item?.type === "mcpToolCall" && allowsMcp(item)) {
            yield {
              type: "tool.completed",
              status:
                item.status === "completed" &&
                (!ownerHost ||
                  (item.error == null &&
                    asRecord(item.result)?.isError !== true))
                  ? "completed"
                  : "failed",
              summary: ownerHost
                ? `MCP ${CodexOwnerProjectMcpPolicy.label(item)}: вызов завершён.`
                : item.tool === "repo_git_head"
                  ? "Чтение Git HEAD завершено."
                  : "Поиск в файлах проекта завершён.",
            };
          }
          continue;
        }

        if (message.method === "turn/completed") {
          const turnResult = asRecord(params.turn) || {};
          const status = turnResult.status;

          // Проверки возможностей выполняются и для дочернего completed turn.
          if (
            status !== "completed" &&
            !matchesActiveTurn(params, active, turnResult.id)
          )
            continue;

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
                  (item?.type === "mcpToolCall" && !allowsMcp(item)) ||
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
              const forbiddenMcp = items
                .map(asRecord)
                .find(
                  (item) => item?.type === "mcpToolCall" && !allowsMcp(item),
                );
              yield {
                type: "run.failed",
                message:
                  ownerHost && forbiddenMcp
                    ? forbiddenToolMessage(forbiddenMcp)
                    : "Codex использовал инструмент вне разрешённого набора.",
              };
              break;
            }
            if (!matchesActiveTurn(params, active, turnResult.id)) continue;
            if (
              (this.options.repositoryMcpURL || ownerHost) &&
              this.options.search?.enabled &&
              this.options.search?.mode === "subagent"
            ) {
              const closed = await closeNativeSearchThreads(
                client,
                active.threadID,
              );
              if (closed)
                yield {
                  type: "tool.completed",
                  status: "completed",
                  summary: "Поисковый агент завершён; дочерние потоки закрыты.",
                };
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
      if (active.cancelled) yield { type: "run.cancelled" };
    } catch (error) {
      if (active?.cancelled || (ownerHost && this.options.signal?.aborted)) {
        yield { type: "run.cancelled" };
        return;
      }
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
