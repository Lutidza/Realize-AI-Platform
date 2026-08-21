/**
 * @file tests/int/change-repository.int.spec.ts
 * @version 2026-08-18
 * @description Verifies normalized persistence for Change Requests and immutable decisions.
 */

import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

import { ChangeRepository } from "../../packages/payload-ai-plugin/src/endpoints/changeRepository";

const repositoryWith = () => {
  const create = vi.fn().mockResolvedValue({ id: 12 });
  const update = vi.fn().mockResolvedValue({ id: 12, version: 2 });
  const payload = {
    create,
    db: { defaultIDType: "number" },
    find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
    update,
  } as unknown as Payload;
  return {
    create,
    repository: new ChangeRepository(payload, {} as PayloadRequest),
    update,
  };
};

describe("ChangeRepository persistence", () => {
  it("persists an approval-only plan with normalized relationships", async () => {
    const { create, repository } = repositoryWith();
    await repository.createChange({
      affectedPaths: ["src/plugins/index.ts"],
      checks: ["npm run typecheck"],
      conversationID: "4",
      expiresAt: "2026-08-19T00:00:00.000Z",
      idempotencyKey: "change-request-1",
      normalizedIntent: "Обновить plugin",
      originalRequest: "Обнови plugin",
      plan: "Изменить src/plugins/index.ts и выполнить npm run typecheck.",
      planHash: "plan-hash",
      requestedBy: 7,
      riskLevel: "R3",
      scopeHash: "scope-hash",
      sourceMessageID: "9",
      title: "Обновить plugin",
      type: "CODE_CHANGE",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-change-requests",
        data: expect.objectContaining({
          conversation: 4,
          sourceMessage: 9,
          sourceMessageKey: "4:9",
          state: "awaiting_plan_approval",
          version: 1,
        }),
      }),
    );
  });

  it("persists one bound decision and advances only the plan projection", async () => {
    const { create, repository, update } = repositoryWith();
    await repository.createApproval({
      actor: 7,
      boundHash: "bound-hash",
      changeRequestID: "12",
      decision: "approved",
      decisionKey: "12:1:PLAN_APPROVAL",
      expiresAt: "2026-08-19T00:00:00.000Z",
      idempotencyKey: "approval-request-1",
      roles: ["admin"],
    });
    await repository.updateDecision("12", "approved", undefined, 2);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-approvals",
        data: expect.objectContaining({
          decisionKey: "12:1:PLAN_APPROVAL",
          roleSnapshot: ["admin"],
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-change-requests",
        data: expect.objectContaining({ state: "plan_approved", version: 2 }),
      }),
    );
  });
});
