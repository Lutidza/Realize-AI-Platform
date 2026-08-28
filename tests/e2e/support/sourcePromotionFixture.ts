/**
 * @file tests/e2e/support/sourcePromotionFixture.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Предоставляет deterministic source promotion evidence для Admin browser scenario.
 */

import type { SourcePromotionDTO } from "@realize/ai-contracts";

export type SourcePromotionFixtureState = "none" | "queued" | "ready";

/** Создаёт queued или ready exact-commit Pull Request fixture. */
export const sourcePromotionFor = (
  state: Exclude<SourcePromotionFixtureState, "none">,
  createdAt: string,
): SourcePromotionDTO => {
  const ready = state === "ready";
  return {
    baseBranch: "main",
    createdAt,
    draft: ready ? true : undefined,
    evidenceHash: ready ? "7".repeat(64) : undefined,
    gitCommit: "3".repeat(40),
    headBranch: "ai/changes/e2e-change-request-777777777777",
    id: "e2e-source-promotion",
    provider: "github",
    pullRequestNumber: ready ? 42 : undefined,
    pullRequestState: ready ? "open" : undefined,
    pullRequestURL: ready
      ? "https://github.com/realize/example/pull/42"
      : undefined,
    repositorySlug: "realize/example",
    sourcePreviewArtifactHash: "1".repeat(64),
    stage: ready ? "complete" : "queued",
    status: ready ? "ready" : "queued",
    updatedAt: createdAt,
  };
};
