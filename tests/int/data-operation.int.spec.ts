/**
 * @file tests/int/data-operation.int.spec.ts
 * @version 2026-08-28
 * @description Проверяет typed catalog executor и normalized DataOperation persistence.
 */

import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

import { CatalogCategoryAssignment } from "../../packages/payload-ai-plugin/src/endpoints/catalogCategoryAssignment";
import { DataOperationAuditRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationAuditRepository";
import { assertDataOperationDecisionReplay } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationDecisionSupport";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";

describe("DataOperation decision replay", () => {
  const approval = {
    decision: "approved",
    id: 8,
    operationVersion: 3,
    targetHash: "b".repeat(64),
    type: "ROLLBACK_APPROVAL",
  } as const;

  it("accepts the committed version produced by a concurrent identical decision", () => {
    expect(() =>
      assertDataOperationDecisionReplay({
        approval,
        decision: "approved",
        expectedVersion: 3,
        operation: { id: 12, version: 4 },
        targetHash: "b".repeat(64),
        type: "ROLLBACK_APPROVAL",
      }),
    ).not.toThrow();
  });

  it("rejects replay against another aggregate version", () => {
    expect(() =>
      assertDataOperationDecisionReplay({
        approval,
        decision: "approved",
        expectedVersion: 2,
        operation: { id: 12, version: 4 },
        targetHash: "b".repeat(64),
        type: "ROLLBACK_APPROVAL",
      }),
    ).toThrow(/different decision/i);
  });
});

describe("DataOperation persistence", () => {
  it("normalizes aggregate, approval and outbox relationships", async () => {
    const create = vi.fn().mockResolvedValue({ id: 12 });
    const payload = {
      create,
      db: { defaultIDType: "number" },
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      update: vi.fn(),
    } as unknown as Payload;
    const req = {} as PayloadRequest;
    const repository = new DataOperationRepository(payload, req);
    const audit = new DataOperationAuditRepository(payload, req);

    await repository.createOperation({
      afterSnapshot: [{ id: "11", title: "Accessories" }],
      beforeSnapshot: [],
      categoryID: "11",
      categorySnapshot: { id: "11", title: "Accessories" },
      conversationID: "4",
      expectedTargetUpdatedAt: "2026-08-28T00:00:00.000Z",
      expiresAt: "2026-08-29T00:00:00.000Z",
      idempotencyKey: "data-operation-request-1",
      intent: { kind: "catalog.assignCategory.v1" },
      operationHash: "a".repeat(64),
      originalRequest: "Добавь категорию",
      productID: "7",
      productSnapshot: { id: "7", title: "Watch" },
      requestedBy: 1,
      rollbackHash: "b".repeat(64),
      sourceMessageID: "9",
      title: "Добавить категорию",
    });
    await audit.createApproval({
      actor: 1,
      boundHash: "c".repeat(64),
      dataOperationID: "12",
      decision: "approved",
      decisionKey: "12:1:WRITE_CONFIRMATION",
      expiresAt: "2026-08-29T00:00:00.000Z",
      idempotencyKey: "data-operation-approval-1",
      operationVersion: 1,
      roles: ["admin"],
      targetHash: "a".repeat(64),
      type: "WRITE_CONFIRMATION",
    });
    await audit.createEvent({
      actor: 1,
      dataOperationID: "12",
      idempotencyKey: "preview:12",
      payload: { operationHash: "a".repeat(64) },
      toState: "awaiting_approval",
      type: "preview_created",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-data-operations",
        data: expect.objectContaining({
          category: 11,
          conversation: 4,
          product: 7,
          sourceMessage: 9,
          sourceMessageKey: "4:9",
          state: "awaiting_approval",
          version: 1,
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-data-operation-approvals",
        data: expect.objectContaining({
          dataOperation: 12,
          operationVersion: 1,
          roleSnapshot: ["admin"],
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "realize-ai-data-operation-events",
        data: expect.objectContaining({
          dataOperation: 12,
          deliveryStatus: "pending",
          topic: "realize.data-operation.preview_created",
        }),
      }),
    );
  });
});

describe("CatalogCategoryAssignment", () => {
  it("dry-runs, applies and restores one category through access-controlled Local API", async () => {
    const categories = [
      { id: 10, slug: "watches", title: "Watches" },
      { id: 11, slug: "accessories", title: "Accessories" },
    ];
    let product = {
      categories: [10],
      id: 7,
      slug: "classic-watch",
      title: "Classic Watch",
      updatedAt: "2026-08-28T00:00:00.000Z",
    };
    let revision = 0;
    const find = vi.fn(async (args: Record<string, unknown>) => {
      const where = args.where as Record<string, unknown>;
      if (args.collection === "products") {
        const id = (where.id as { equals?: unknown } | undefined)?.equals;
        const slug = (where.slug as { equals?: unknown } | undefined)?.equals;
        const matches =
          (id === undefined || Number(id) === product.id) &&
          (slug === undefined || slug === product.slug);
        return {
          docs: matches ? [{ ...product }] : [],
          totalDocs: matches ? 1 : 0,
        };
      }
      const ids = (where.id as { in?: unknown[] } | undefined)?.in;
      const slug = (where.slug as { equals?: unknown } | undefined)?.equals;
      const docs = categories.filter(
        (category) =>
          (!ids || ids.map(Number).includes(category.id)) &&
          (slug === undefined || slug === category.slug),
      );
      return { docs, totalDocs: docs.length };
    });
    const update = vi.fn(async (args: Record<string, unknown>) => {
      const where = args.where as {
        and: Array<Record<string, { equals: unknown }>>;
      };
      const id = Number(where.and[0].id.equals);
      const updatedAt = String(where.and[1].updatedAt.equals);
      if (id !== product.id || updatedAt !== product.updatedAt) {
        return { docs: [], errors: [] };
      }
      revision += 1;
      product = {
        ...product,
        categories: (args.data as { categories: number[] }).categories,
        updatedAt: `2026-08-28T00:00:0${revision}.000Z`,
      };
      return { docs: [{ ...product }], errors: [] };
    });
    const payload = {
      db: { defaultIDType: "number" },
      find,
      update,
    } as unknown as Payload;
    const executor = new CatalogCategoryAssignment(
      payload,
      {} as PayloadRequest,
    );

    const dryRun = await executor.dryRun({
      category: { slug: "accessories" },
      kind: "catalog.assignCategory.v1",
      product: { slug: "classic-watch" },
      version: "1.0",
    });
    expect(dryRun.beforeCategoryIDs).toEqual(["10"]);
    expect(dryRun.afterCategoryIDs).toEqual(["10", "11"]);
    expect(dryRun.preview.addedCategories).toEqual([
      expect.objectContaining({ id: "11", slug: "accessories" }),
    ]);

    const appliedUpdatedAt = await executor.apply({
      ...dryRun,
      productID: dryRun.preview.product.id,
    });
    expect(product.categories).toEqual([10, 11]);
    expect(appliedUpdatedAt).toBe("2026-08-28T00:00:01.000Z");

    await executor.rollback({
      afterCategoryIDs: dryRun.afterCategoryIDs,
      appliedTargetUpdatedAt: appliedUpdatedAt,
      beforeCategoryIDs: dryRun.beforeCategoryIDs,
      productID: dryRun.preview.product.id,
    });
    expect(product.categories).toEqual([10]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false }),
    );
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false }),
    );
  });
});
