/**
 * @file packages/codex-adapter/src/OpenAICodexAdapter.ts
 * @version 2026-08-21
 * @description Implements isolated read-only and workspace-write Codex App Server turns.
 */

import type {
  AgentEvent,
  CodingAgentAdapter,
  RunTurnInput,
  UsageSummary,
} from "@realize/ai-contracts";

import { JsonLineRPCClient } from "./JsonLineRPCClient";
import type {
  RPCMessage,
  ThreadStartResult,
  TokenUsage,
  TurnStartResult,
} from "./protocol";

type ActiveRun = {
  client: JsonLineRPCClient;
  threadID: string;
  turnID: string;
};

/** Process-level options that remain outside browser and public API contracts. */
export type OpenAICodexAdapterOptions = {
  codexBinary?: string;
  environment?: NodeJS.ProcessEnv;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
};

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

/** Executes policy-selected turns and normalizes App Server notifications. */
export class OpenAICodexAdapter implements CodingAgentAdapter {
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(private readonly options: OpenAICodexAdapterOptions = {}) {}

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

    const client = new JsonLineRPCClient({
      codexBinary: this.options.codexBinary,
      environment: this.options.environment,
      workingDirectory: input.cwd,
    });
    client.start();

    let active: ActiveRun | undefined;
    let accumulatedMessage = "";
    const writable = input.sandboxProfile === "code-workspace-write";
    const sandbox = writable ? "workspace-write" : "read-only";

    try {
      await client.request("initialize", {
        capabilities: null,
        clientInfo: {
          name: "realize-ai-control-plane",
          title: "Realize AI Control Plane",
          version: "0.1.0",
        },
      });
      client.notify("initialized");

      const thread = input.threadID
        ? await client.request<ThreadStartResult>("thread/resume", {
            approvalPolicy: "never",
            baseInstructions: null,
            cwd: input.cwd,
            developerInstructions: input.developerInstructions,
            model: input.model || null,
            sandbox,
            threadId: input.threadID,
          })
        : await client.request<ThreadStartResult>("thread/start", {
            approvalPolicy: "never",
            cwd: input.cwd,
            developerInstructions: input.developerInstructions,
            ephemeral: input.ephemeral ?? false,
            model: input.model || null,
            sandbox,
          });

      const turn = await client.request<TurnStartResult>("turn/start", {
        approvalPolicy: "never",
        input: [{ text: input.prompt, text_elements: [], type: "text" }],
        threadId: thread.thread.id,
      });

      active = {
        client,
        threadID: thread.thread.id,
        turnID: turn.turn.id,
      };
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
            item?.type === "mcpToolCall" ||
            item?.type === "dynamicToolCall"
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
          continue;
        }

        if (message.method === "item/completed") {
          const item = asRecord(params.item);
          if (
            (!writable && item?.type === "fileChange") ||
            item?.type === "mcpToolCall" ||
            item?.type === "dynamicToolCall"
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
          continue;
        }

        if (message.method === "turn/completed") {
          const turnResult = asRecord(params.turn) || {};
          const status = turnResult.status;

          if (status === "completed") {
            const content =
              finalMessageFromTurn(turnResult) || accumulatedMessage;
            yield { content, type: "assistant.completed" };
          } else if (status === "interrupted") {
            yield { type: "run.cancelled" };
          } else {
            const error = asRecord(turnResult.error);
            yield {
              message:
                typeof error?.message === "string"
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
        message:
          error instanceof Error ? error.message : "Codex adapter failed.",
        type: "run.failed",
      };
    } finally {
      if (active) this.activeRuns.delete(input.runID);
      await client.close();
    }
  }
}
