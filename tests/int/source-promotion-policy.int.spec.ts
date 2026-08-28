/**
 * @file tests/int/source-promotion-policy.int.spec.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Проверяет deterministic source identity и exact GitHub PR evidence binding.
 */

import {
  assessSourcePromotionEvidence,
  createSourcePromotionEvidenceHash,
  createSourcePromotionHeadBranch,
  createSourcePromotionKey,
} from "@realize/change-engine";
import { describe, expect, it } from "vitest";

const source = {
  baseBranch: "main",
  changeRequestID: "42",
  gitCommit: "a".repeat(40),
  repositorySlug: "realize/example",
  sourceAcceptanceHash: "b".repeat(64),
  sourcePreviewArtifactHash: "c".repeat(64),
  sourcePreviewEvidenceHash: "d".repeat(64),
};

describe("source promotion policy", () => {
  it("derives one branch from the exact accepted preview binding", () => {
    const promotionKey = createSourcePromotionKey(source);
    const branch = createSourcePromotionHeadBranch({
      changeRequestID: source.changeRequestID,
      promotionKey,
    });

    expect(promotionKey).toMatch(/^[a-f0-9]{64}$/);
    expect(branch).toBe(`ai/changes/42-${promotionKey.slice(0, 12)}`);
    expect(
      createSourcePromotionKey({
        ...source,
        gitCommit: "e".repeat(40),
      }),
    ).not.toBe(promotionKey);
  });

  it("accepts only a repository-bound Pull Request URL and exact hashes", () => {
    const promotionKey = createSourcePromotionKey(source);
    const headBranch = createSourcePromotionHeadBranch({
      changeRequestID: source.changeRequestID,
      promotionKey,
    });
    const result = {
      ...source,
      draft: true,
      headBranch,
      promotionKey,
      pullRequestNumber: 17,
      pullRequestState: "open" as const,
      pullRequestURL: "https://github.com/realize/example/pull/17",
    };
    const evidenceHash = createSourcePromotionEvidenceHash(result);

    expect(assessSourcePromotionEvidence({ ...result, evidenceHash })).toEqual({
      allowed: true,
    });
    expect(
      assessSourcePromotionEvidence({
        ...result,
        evidenceHash,
        pullRequestURL: "https://github.com/attacker/example/pull/17",
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: expect.stringContaining("URL"),
      }),
    );
    expect(
      assessSourcePromotionEvidence({
        ...result,
        draft: false,
        evidenceHash: createSourcePromotionEvidenceHash({
          ...result,
          draft: false,
        }),
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: expect.stringContaining("open draft"),
      }),
    );
  });
});
