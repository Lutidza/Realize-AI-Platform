/**
 * @file packages/ai-contracts/src/execution.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт безопасные контракты выполнения, состояния исполнителя и принятия результата.
 */

import type { WorkerAvailabilityDTO } from "./WorkerAvailability.types";

/** Durable lifecycle of one isolated code implementation job. */
export type ExecutionJobStatus =
  | "blocked"
  | "cancelled"
  | "completed"
  | "failed"
  | "preparing_workspace"
  | "queued"
  | "running"
  | "validating";

/** Coarse execution stage used for stable Admin progress rendering. */
export type ExecutionStage =
  | "complete"
  | "implementation"
  | "queued"
  | "validation"
  | "workspace_preparation";

/** Result of one server-owned, allowlisted verification command. */
export type ExecutionCheckDTO = {
  command: string;
  durationMs: number;
  evidenceHash: string;
  finishedAt: string;
  id: string;
  outputSummary?: string;
  startedAt: string;
  status: "failed" | "passed";
};

/** Per-file diff metrics safe to expose to an authorized administrator. */
export type ExecutionDiffStatDTO = {
  additions?: number;
  deletions?: number;
  path: string;
};

/** Browser projection of a durable isolated implementation job. */
export type ExecutionJobDTO = {
  allowedPaths: string[];
  artifactsExpireAt: string;
  baseCommit: string;
  branch: string;
  changedPaths: string[];
  checks: ExecutionCheckDTO[];
  createdAt: string;
  diff?: string;
  diffHash?: string;
  diffStat: ExecutionDiffStatDTO[];
  diffTruncated: boolean;
  errorSummary?: string;
  evidenceHash?: string;
  finishedAt?: string;
  id: string;
  stage: ExecutionStage;
  startedAt?: string;
  status: ExecutionJobStatus;
  updatedAt: string;
  workerSummary?: string;
};

/** Append-only human decision bound to the produced diff and check evidence. */
export type ImplementationAcceptanceDTO = {
  actorRole: string;
  boundHash: string;
  comment?: string;
  createdAt: string;
  decision: "approved" | "rejected";
  diffHash: string;
  expiresAt: string;
  id: string;
};

/** Effective execution availability and the current durable job, if any. */
export type ChangeExecutionDTO = {
  enabled: boolean;
  worker?: WorkerAvailabilityDTO;
  job?: ExecutionJobDTO;
  reason?: string;
};

/** Optimistic-lock payload that queues one exact approved plan. */
export type ExecuteChangeInput = {
  expectedVersion: number;
};

/** Optimistic-lock payload that accepts a verified implementation result. */
export type AcceptImplementationInput = {
  comment?: string;
  expectedDiffHash: string;
  expectedVersion: number;
};

/** Optimistic-lock payload that rejects a verified implementation result. */
export type RejectImplementationInput = {
  comment: string;
  expectedDiffHash: string;
  expectedVersion: number;
};
