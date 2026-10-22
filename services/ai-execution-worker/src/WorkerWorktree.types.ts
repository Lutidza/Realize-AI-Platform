/**
 * @file services/ai-execution-worker/src/WorkerWorktree.types.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Определяет внутренние привязки worktree и заимствование общего Git lease.
 */
import type { GitLock } from "@realize/git-runtime";
import type { ClaimedPreviewDeployment } from "./previewTypes";
import type { ClaimedExecutionJob } from "./types";

export type CreateBoundWorktreeInput = {
  baseCommit: string;
  branch: string;
  repositoryRoot: string;
  workspaceID: string;
  workspaceRoot: string;
  existingLease?: GitLock;
};

export type CreateExecutionWorktreeInput = Pick<
  CreateBoundWorktreeInput,
  "repositoryRoot" | "workspaceRoot" | "existingLease"
> & { job: ClaimedExecutionJob };

export type PreparePromotionWorktreeInput = Pick<
  CreateBoundWorktreeInput,
  "repositoryRoot" | "workspaceRoot" | "existingLease"
> & { job: ClaimedPreviewDeployment };

export type PromotionArtifactInput = {
  job: ClaimedPreviewDeployment;
  workspace: string;
  existingLease?: GitLock;
};

export type RemovePromotionWorktreeInput = Pick<
  CreateBoundWorktreeInput,
  "repositoryRoot" | "workspaceRoot" | "workspaceID" | "existingLease"
> & { branch?: string };
