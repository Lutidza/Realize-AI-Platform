/**
 * @file tests/int/source-promotion-repository.int.spec.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Проверяет source-bound Payload queue без GitHub token или raw provider response.
 */

import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

import { SourcePromotionRepository } from "../../packages/payload-ai-plugin/src/endpoints/sourcePromotionRepository";

describe("SourcePromotionRepository", () => {
  it("persists only immutable destination and accepted-preview fields", async () => {
    const create = vi.fn().mockResolvedValue({ id: 41 });
    const update = vi.fn().mockResolvedValue({ id: 41 });
    const payload = {
      create,
      db: { defaultIDType: "number" },
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      update,
    } as unknown as Payload;
    const repository = new SourcePromotionRepository(
      payload,
      {} as PayloadRequest,
    );

    await repository.createPromotion({
      baseBranch: "main",
      changeRequestID: "12",
      gitCommit: "a".repeat(40),
      headBranch: "ai/changes/12-123456789abc",
      idempotencyKey: "source-request",
      initiatedBy: 7,
      integrationRevision: 3,
      previewDeploymentID: "21",
      promotionKey: "b".repeat(64),
      repositorySlug: "realize/example",
      sourceAcceptanceHash: "c".repeat(64),
      sourcePreviewArtifactHash: "d".repeat(64),
      sourcePreviewEvidenceHash: "e".repeat(64),
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-source-promotions",
        data: expect.objectContaining({
          changeRequest: 12,
          previewDeployment: 21,
          provider: "github",
          stage: "queued",
          status: "queued",
        }),
      }),
    );
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty("token");
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty(
      "providerResponse",
    );

    await repository.requeuePromotion({
      integrationRevision: 4,
      promotionID: 41,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-source-promotions",
        data: expect.objectContaining({
          integrationRevision: 4,
          stage: "queued",
          status: "queued",
        }),
        id: 41,
      }),
    );
  });
});
