/**
 * @file packages/payload-ai-plugin/src/admin/runStreamTypes.ts
 * @version 2026-08-18
 * @description Defines browser run lifecycle state shared by Admin chat owners.
 */

import type { RunDTO, RunStatus, UsageSummary } from "@realize/ai-contracts";

const ACTIVE_RUN_STATUSES: RunStatus[] = ["queued", "running"];

/** Browser-visible lifecycle of the SSE connection and durable reconciliation. */
export type RunStreamPhase =
  | "connecting"
  | "finalizing"
  | "idle"
  | "reconnecting"
  | "streaming"
  | "sync-error"
  | "waiting";

/** State exposed by the run transport hook to presentational Admin components. */
export type RunStreamState = {
  elapsedSeconds: number;
  issue?: string;
  phase: RunStreamPhase;
  retry: () => void;
  streamingMessage: string;
  toolSummary?: string;
  usage?: UsageSummary;
};

/** Identifies runs that still accept cancellation and stream reconciliation. */
export const isActiveRun = (run?: RunDTO): run is RunDTO =>
  Boolean(run && ACTIVE_RUN_STATUSES.includes(run.status));
