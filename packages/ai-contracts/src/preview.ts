/**
 * @file packages/ai-contracts/src/preview.ts
 * @owner packages/ai-contracts
 * @purpose Defines browser-safe local preview, independent review and acceptance contracts.
 */

import type { ExecutionCheckDTO } from "./execution";

/** Durable lifecycle of one accepted-diff promotion into a local preview. */
export type PreviewDeploymentStatus =
  | "accepted"
  | "blocked"
  | "cancelled"
  | "committing"
  | "expired"
  | "failed"
  | "preparing_workspace"
  | "queued"
  | "ready"
  | "rejected"
  | "reviewing"
  | "running_checks"
  | "starting_preview";

/** Coarse promotion stage used for stable Admin progress rendering. */
export type PreviewDeploymentStage =
  | "commit"
  | "complete"
  | "independent_review"
  | "preview_startup"
  | "queued"
  | "validation"
  | "workspace_preparation";

/** One bounded issue returned by the independent read-only reviewer. */
export type IndependentReviewFindingDTO = {
  category: "architecture" | "correctness" | "security" | "tests";
  path?: string;
  severity: "blocking" | "warning";
  summary: string;
};

/** Persisted verdict produced by a separate ephemeral reviewer turn. */
export type IndependentReviewDTO = {
  completedAt: string;
  evidenceHash: string;
  findings: IndependentReviewFindingDTO[];
  model?: string;
  status: "approved" | "changes_requested";
  summary: string;
};

/** Browser projection of one exact-commit local preview environment. */
export type PreviewDeploymentDTO = {
  artifactHash?: string;
  artifactKind: "local-git-preview";
  baseCommit: string;
  branch: string;
  checks: ExecutionCheckDTO[];
  commitSHA?: string;
  createdAt: string;
  environment: "local-preview";
  evidenceHash?: string;
  errorSummary?: string;
  expiresAt: string;
  healthSummary?: string;
  id: string;
  previewURL?: string;
  reviewer?: IndependentReviewDTO;
  runtimeState: "active" | "pending" | "stopped";
  sourceDiffHash: string;
  stage: PreviewDeploymentStage;
  status: PreviewDeploymentStatus;
  treeHash?: string;
  updatedAt: string;
};

/** Human decision bound to one preview artifact and environment. */
export type PreviewAcceptanceDTO = {
  actorRole: string;
  artifactHash: string;
  boundHash: string;
  comment?: string;
  createdAt: string;
  decision: "approved" | "rejected";
  environment: "local-preview";
  expiresAt: string;
  id: string;
};

/** Effective preview availability and latest durable environment evidence. */
export type ChangePreviewDTO = {
  acceptance?: PreviewAcceptanceDTO;
  deployment?: PreviewDeploymentDTO;
  enabled: boolean;
  reason?: string;
};

/** Optimistic-lock payload that promotes one exact accepted diff. */
export type DeployPreviewInput = {
  expectedDiffHash: string;
  expectedVersion: number;
};

/** Optimistic-lock payload that accepts one exact preview artifact. */
export type AcceptPreviewInput = {
  comment?: string;
  expectedArtifactHash: string;
  expectedVersion: number;
};

/** Optimistic-lock payload that rejects one exact preview artifact. */
export type RejectPreviewInput = {
  comment: string;
  expectedArtifactHash: string;
  expectedVersion: number;
};
