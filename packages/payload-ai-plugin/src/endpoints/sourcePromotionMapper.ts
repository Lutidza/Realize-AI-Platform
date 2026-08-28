/**
 * @file packages/payload-ai-plugin/src/endpoints/sourcePromotionMapper.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Проецирует internal source promotion record в browser-safe DTO.
 */

import type {
  SourcePromotionDTO,
  SourcePromotionStage,
  SourcePromotionStatus,
} from "@realize/ai-contracts";

import type { AIDocument } from "./repository";

const iso = (value: unknown): string =>
  typeof value === "string" ? value : new Date(0).toISOString();

/** Исключает worker, integration revision и persistence relations из DTO. */
export const toSourcePromotionDTO = (
  document: AIDocument,
): SourcePromotionDTO => ({
  baseBranch:
    typeof document.baseBranch === "string" ? document.baseBranch : "",
  createdAt: iso(document.createdAt),
  draft: typeof document.draft === "boolean" ? document.draft : undefined,
  errorSummary:
    typeof document.errorSummary === "string"
      ? document.errorSummary
      : undefined,
  evidenceHash:
    typeof document.evidenceHash === "string"
      ? document.evidenceHash
      : undefined,
  gitCommit: typeof document.gitCommit === "string" ? document.gitCommit : "",
  headBranch:
    typeof document.headBranch === "string" ? document.headBranch : "",
  id: String(document.id),
  provider: "github",
  pullRequestNumber:
    typeof document.pullRequestNumber === "number"
      ? document.pullRequestNumber
      : undefined,
  pullRequestState:
    document.pullRequestState === "open" ||
    document.pullRequestState === "closed"
      ? document.pullRequestState
      : undefined,
  pullRequestURL:
    typeof document.pullRequestURL === "string"
      ? document.pullRequestURL
      : undefined,
  repositorySlug:
    typeof document.repositorySlug === "string" ? document.repositorySlug : "",
  sourcePreviewArtifactHash:
    typeof document.sourcePreviewArtifactHash === "string"
      ? document.sourcePreviewArtifactHash
      : "",
  stage: document.stage as SourcePromotionStage,
  status: document.status as SourcePromotionStatus,
  updatedAt: iso(document.updatedAt),
});
