/**
 * @file tests/int/release-repository.int.spec.ts
 * @version 2026-08-22
 * @description Проверяет отдельную Payload-очередь OCI-кандидатов без raw provider state.
 */

import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

import { ReleaseRepository } from "../../packages/payload-ai-plugin/src/endpoints/releaseRepository";

describe("ReleaseRepository", () => {
  it("persists only source-bound release queue fields", async () => {
    const create = vi.fn().mockResolvedValue({ id: 31 });
    const payload = {
      create,
      db: { defaultIDType: "number" },
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      update: vi.fn(),
    } as unknown as Payload;
    const repository = new ReleaseRepository(payload, {} as PayloadRequest);

    await repository.createCandidate({
      candidateKey: "candidate-key",
      changeRequestID: "12",
      expiresAt: "2099-01-02T00:00:00.000Z",
      gitCommit: "a".repeat(40),
      idempotencyKey: "release-request",
      initiatedBy: 7,
      previewDeploymentID: "21",
      sourceAcceptanceHash: "b".repeat(64),
      sourcePreviewArtifactHash: "c".repeat(64),
      sourcePreviewEvidenceHash: "d".repeat(64),
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-release-candidates",
        data: expect.objectContaining({
          changeRequest: 12,
          previewDeployment: 21,
          previewStatus: "pending",
          signatureVerified: false,
          stage: "queued",
          status: "queued",
          targetEnvironment: "production",
        }),
      }),
    );
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty("imageDigest");
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty("providerToken");
  });

  it("scopes idempotency lookup to the same change and actor", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 });
    const payload = {
      create: vi.fn(),
      db: { defaultIDType: "number" },
      find,
      update: vi.fn(),
    } as unknown as Payload;
    const repository = new ReleaseRepository(payload, {} as PayloadRequest);

    await repository.findByIdempotencyKey("12", 7, "release-request");

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [
            { changeRequest: { equals: 12 } },
            { initiatedBy: { equals: 7 } },
            { idempotencyKey: { equals: "release-request" } },
          ],
        },
      }),
    );
  });
});
