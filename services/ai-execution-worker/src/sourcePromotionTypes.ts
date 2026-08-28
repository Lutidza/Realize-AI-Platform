/**
 * @file services/ai-execution-worker/src/sourcePromotionTypes.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Описывает internal exact-commit source promotion contracts worker-а.
 */

/** Source promotion, atomically claimed из PostgreSQL. */
export type ClaimedSourcePromotion = {
  baseBranch: string;
  changeRequestID: number;
  changeTitle: string;
  gitCommit: string;
  headBranch: string;
  id: number;
  integrationRevision: number;
  promotionKey: string;
  repositorySlug: string;
  sourceAcceptanceHash: string;
  sourcePreviewArtifactHash: string;
  sourcePreviewEvidenceHash: string;
};

/** Проверенный ответ GitHub API для одного exact head commit. */
export type PublishedPullRequest = {
  draft: boolean;
  number: number;
  state: "closed" | "open";
  url: string;
};
