/**
 * @file packages/ai-contracts/src/sourcePromotion.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Задаёт browser-safe контракт публикации exact preview commit в draft Pull Request.
 */

/** Долговечное состояние одной source-control promotion. */
export type SourcePromotionStatus =
  | "blocked"
  | "creating_pull_request"
  | "failed"
  | "publishing_ref"
  | "queued"
  | "ready"
  | "validating";

/** Укрупнённый этап, пригодный для стабильного отображения в Admin. */
export type SourcePromotionStage =
  | "complete"
  | "pull_request"
  | "queued"
  | "ref_publication"
  | "source_validation";

/** Browser-safe evidence exact-commit публикации без credential material. */
export type SourcePromotionDTO = {
  baseBranch: string;
  createdAt: string;
  draft?: boolean;
  errorSummary?: string;
  evidenceHash?: string;
  gitCommit: string;
  headBranch: string;
  id: string;
  provider: "github";
  pullRequestNumber?: number;
  pullRequestState?: "closed" | "open";
  pullRequestURL?: string;
  repositorySlug: string;
  sourcePreviewArtifactHash: string;
  stage: SourcePromotionStage;
  status: SourcePromotionStatus;
  updatedAt: string;
};

/** Доступность source promotion и последняя долговечная задача. */
export type ChangeSourcePromotionDTO = {
  enabled: boolean;
  promotion?: SourcePromotionDTO;
  reason?: string;
};

/** Optimistic-lock запрос на публикацию exact accepted preview commit. */
export type PublishPullRequestInput = {
  expectedGitCommit: string;
  expectedPreviewArtifactHash: string;
  expectedVersion: number;
};
