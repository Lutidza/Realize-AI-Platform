/**
 * @file packages/ai-contracts/src/agent.ts
 * @version 2026-08-21
 * @description Defines the provider-neutral read and isolated-write agent boundary.
 */

import type { UsageSummary } from "./api";

/** Complete provider-neutral input for one policy-selected agent turn. */
export type RunTurnInput = {
  cwd: string;
  developerInstructions: string;
  ephemeral?: boolean;
  model?: string;
  prompt: string;
  runID: string;
  sandboxProfile?:
    "analysis-readonly" | "code-workspace-write" | "review-readonly";
  threadID?: string;
};

/** Normalized event stream emitted by any coding-agent adapter. */
export type AgentEvent =
  | {
      threadID: string;
      type: "run.started";
    }
  | {
      delta: string;
      type: "assistant.delta";
    }
  | {
      content: string;
      type: "assistant.completed";
    }
  | {
      durationMs?: number;
      status: "completed" | "failed";
      summary: string;
      type: "tool.completed";
    }
  | {
      summary: string;
      type: "tool.started";
    }
  | {
      type: "usage.updated";
      usage: UsageSummary;
    }
  | {
      message: string;
      type: "run.failed";
    }
  | {
      type: "run.cancelled";
    };

/** Minimal execution contract implemented by a provider-specific adapter. */
export interface CodingAgentAdapter {
  cancelRun(runID: string): Promise<void>;
  runTurn(input: RunTurnInput): AsyncIterable<AgentEvent>;
}
