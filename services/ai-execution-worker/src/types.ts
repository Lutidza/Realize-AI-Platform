/**
 * @file services/ai-execution-worker/src/types.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Задаёт durable job с проверяемым исходным контекстом и результатами проверок.
 */

import type { ExecutionCapabilityClaims } from "@realize/change-engine";

/** Worker-owned projection loaded atomically from PostgreSQL. */
export type ClaimedExecutionJob = {
  /** Проверяется после claim, чтобы повреждённое задание стало blocked, а не зациклило очередь. */
  executionContext?: unknown;
  allowedPaths: string[];
  approvedVersion: number;
  artifactsExpireAt: string;
  baseCommit: string;
  branch: string;
  capability: ExecutionCapabilityClaims;
  capabilityTokenHash: string;
  changeRequestID: number;
  checks: string[];
  executionKey: string;
  id: number;
  originalRequest: string;
  plan: string;
  planHash: string;
  scopeHash: string;
  workspaceID: string;
};

/** Complete result of one allowlisted verification command. */
export type WorkerCheckResult = {
  command: string;
  durationMs: number;
  evidenceHash: string;
  finishedAt: string;
  outputSummary?: string;
  startedAt: string;
  status: "failed" | "passed";
};

/** Validated diff evidence produced from the isolated worktree. */
export type WorktreeDiff = {
  changedPaths: string[];
  diff: string;
  diffHash: string;
  diffStat: Array<{
    additions?: number;
    deletions?: number;
    path: string;
  }>;
  diffTruncated: boolean;
};

/** templateFiles строится worker по Git baseCommit и никогда не принимается от клиента. */
export type WorktreeChangeScope = Pick<
  ClaimedExecutionJob,
  "allowedPaths" | "baseCommit" | "branch"
> & {
  verifiedTemplateFiles?: ReadonlySet<string>;
};
