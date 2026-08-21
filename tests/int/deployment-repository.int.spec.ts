/**
 * @file tests/int/deployment-repository.int.spec.ts
 * @owner tests/int
 * @purpose Verifies durable preview queue fields and hidden runtime boundaries.
 */

import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

import { DeploymentRepository } from "../../packages/payload-ai-plugin/src/endpoints/deploymentRepository";

describe("DeploymentRepository", () => {
  it("persists an exact accepted artifact without a database URL or process handle", async () => {
    const create = vi.fn().mockResolvedValue({ id: 21 });
    const payload = {
      create,
      db: { defaultIDType: "number" },
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      update: vi.fn(),
    } as unknown as Payload;
    const repository = new DeploymentRepository(payload, {} as PayloadRequest);

    await repository.createDeployment({
      baseCommit: "a".repeat(40),
      boundImplementationHash: "b".repeat(64),
      branch: "ai/preview-12345678",
      changeRequestID: "12",
      deploymentKey: "deployment-key",
      executionJobID: "18",
      expiresAt: "2099-01-02T00:00:00.000Z",
      idempotencyKey: "preview-request",
      initiatedBy: 7,
      requiredChecks: ["npm run typecheck"],
      sourceDiffHash: "c".repeat(64),
      sourceEvidenceHash: "d".repeat(64),
      workspaceID: "preview-12345678",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-deployments",
        data: expect.objectContaining({
          changeRequest: 12,
          executionJob: 18,
          runtimeState: "pending",
          stage: "queued",
          status: "queued",
        }),
      }),
    );
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty("databaseURL");
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty("processID");
  });

  it("loads one deployment through a typed identifier query", async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [{ changeRequest: 12, id: 21 }],
      totalDocs: 1,
    });
    const payload = {
      create: vi.fn(),
      db: { defaultIDType: "number" },
      find,
      update: vi.fn(),
    } as unknown as Payload;
    const repository = new DeploymentRepository(payload, {} as PayloadRequest);

    await expect(repository.getDeployment("21")).resolves.toEqual({
      changeRequest: 12,
      id: 21,
    });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-deployments",
        where: { id: { equals: 21 } },
      }),
    );
  });
});
