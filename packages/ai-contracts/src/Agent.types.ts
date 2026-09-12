/**
 * @file packages/ai-contracts/src/Agent.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт независимый от провайдера контракт запуска агента и нормализованных событий.
 */

import type { UsageSummary } from "./api";
import type { ChatSourceDto } from "./ChatContext.types";

/** Политика выбирается сервером; пути изображений разрешаются только внутри снимка cwd. */
export type RunTurnInput = {
  cwd: string;
  developerInstructions: string;
  ephemeral?: boolean;
  images?: Array<{ path: string }>;
  model?: string;
  prompt: string;
  runID: string;
  sandboxProfile?:
    "analysis-readonly" | "code-workspace-write" | "review-readonly";
  threadID?: string;
  webSearch?: boolean;
};

/** Источники ответа происходят из подтверждённых данных провайдера, а не из сгенерированного текста. */
export type AgentEvent =
  | { threadID: string; type: "run.started" }
  | { delta: string; type: "assistant.delta" }
  | { content: string; sources?: ChatSourceDto[]; type: "assistant.completed" }
  | {
      durationMs?: number;
      status: "completed" | "failed";
      summary: string;
      type: "tool.completed";
    }
  | { summary: string; type: "tool.started" }
  | { type: "usage.updated"; usage: UsageSummary }
  | { message: string; type: "run.failed" }
  | { type: "run.cancelled" };

/** Минимальный lifecycle, реализуемый адаптером внешнего агента. */
export interface CodingAgentAdapter {
  cancelRun(runID: string): Promise<void>;
  runTurn(input: RunTurnInput): AsyncIterable<AgentEvent>;
}
