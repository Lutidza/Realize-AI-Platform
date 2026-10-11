/**
 * @file tests/int/execution-repository.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет persistence связанного AI-контекста и hashed capability очереди.
 */
import { createExecutionContextFixture } from "./fixtures/systemAIRelease.fixture";

import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

import { ExecutionRepository } from "../../packages/payload-ai-plugin/src/endpoints/executionRepository";

describe("ExecutionRepository", () => {
  it("persists only hashed capability material and exact approved scope", async () => {
    const create = vi.fn().mockResolvedValue({ id: 18 });
    const payload = {
      create,
      db: { defaultIDType: "number" },
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
    } as unknown as Payload;
    const repository = new ExecutionRepository(payload, {} as PayloadRequest);

    await repository.createJob({
      executionContext: createExecutionContextFixture(),
      allowedPaths: ["src/components/Header/index.tsx"],
      approvedVersion: 1,
      artifactsExpireAt: "2099-01-02T00:00:00.000Z",
      baseCommit: "a".repeat(40),
      boundPlanHash: "b".repeat(64),
      boundScopeHash: "c".repeat(64),
      branch: "ai/change-12345678",
      capabilityExpiresAt: "2099-01-01T01:00:00.000Z",
      capabilityIssuedAt: "2099-01-01T00:00:00.000Z",
      capabilityNonce: "nonce",
      capabilityTokenHash: "d".repeat(64),
      changeRequestID: "12",
      checks: ["npm run typecheck"],
      executionKey: "execution-key",
      idempotencyKey: "execution-request",
      requestedBy: 7,
      workspaceID: "change-12345678",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-execution-jobs",
        data: expect.objectContaining({
          capabilityTokenHash: "d".repeat(64),
          changeRequest: 12,
          stage: "queued",
          status: "queued",
        }),
      }),
    );
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty("token");
  });
});
