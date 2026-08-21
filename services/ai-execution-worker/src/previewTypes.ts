/**
 * @file services/ai-execution-worker/src/previewTypes.ts
 * @owner services/ai-execution-worker
 * @purpose Defines internal accepted-diff promotion, review and preview runtime records.
 */

import type { IndependentReviewFindingDTO } from "@realize/ai-contracts";

/** Worker-owned promotion projection loaded atomically from PostgreSQL. */
export type ClaimedPreviewDeployment = {
  allowedPaths: string[];
  baseCommit: string;
  branch: string;
  changeRequestID: number;
  deploymentKey: string;
  diff: string;
  expectedPaths: string[];
  executionJobID: number;
  expiresAt: string;
  id: number;
  originalRequest: string;
  plan: string;
  requiredChecks: string[];
  sourceDiffHash: string;
  sourceEvidenceHash: string;
  workspaceID: string;
};

/** Strict result parsed from a separate read-only Codex reviewer turn. */
export type IndependentReviewResult = {
  completedAt: string;
  evidenceHash: string;
  findings: IndependentReviewFindingDTO[];
  model?: string;
  status: "approved" | "changes_requested";
  summary: string;
};

/** Immutable Git identity created only after checks and independent review. */
export type PromotionCommit = {
  artifactHash: string;
  commitSHA: string;
  treeHash: string;
};

/** Internal handles required to operate and later clean one loopback preview. */
export type LocalPreviewRuntime = {
  databaseName: string;
  databaseURL: string;
  healthSummary: string;
  port: number;
  previewURL: string;
  processID: number;
};

/** Minimal persisted handles required for TTL or rejection cleanup. */
export type PreviewCleanupTarget = {
  branch: string;
  changeRequestID: number;
  databaseName?: string;
  expiresAt: string;
  id: number;
  processID?: number;
  status: string;
  workspaceID: string;
};
