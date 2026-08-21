/**
 * @file services/ai-execution-worker/src/types.ts
 * @version 2026-08-21
 * @description Defines internal durable job and verification evidence records.
 */

import type { ExecutionCapabilityClaims } from "@realize/change-engine";

/** Worker-owned projection loaded atomically from PostgreSQL. */
export type ClaimedExecutionJob = {
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
