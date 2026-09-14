// @vitest-environment node
/**
 * @file tests/int/pageStructureDispatch.int.spec.ts
 * @version 1.1.1
 * @date 2026-09-14
 * @description Проверяет новый dispatch Data Lane, проверяемое происхождение и безопасную проекцию структурной операции.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import type {
  PageDraftStructurePreviewDTO,
  UpdatePageStructureDraftIntent,
} from "@realize/ai-contracts";
import {
  createDataOperationApprovalBinding,
  createPageDraftStructureRollbackHash,
} from "@realize/change-engine";
import { createTypedDataOperationPlan } from "../../packages/payload-ai-plugin/src/endpoints/createTypedDataOperationPlan.service";
import { applyDataOperation } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationExecution";
import { rollbackDataOperation } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRollback";
import { toDataOperationDTO } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationMapper";
import { PageDraftStructure } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftStructure.service";
import type { PageDraftStructureSnapshot } from "../../packages/payload-ai-plugin/src/endpoints/PageDraftStructure.types";
import { PageDraftUpdate } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service";
import { CatalogCategoryAssignment } from "../../packages/payload-ai-plugin/src/endpoints/catalogCategoryAssignment";
import {
  AIRepository,
  type AIDocument,
} from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import { DataOperationAuditRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationAuditRepository";
import { EndpointError } from "../../packages/payload-ai-plugin/src/endpoints/http";
import { lockAITransaction } from "../../packages/payload-ai-plugin/src/endpoints/lockAITransaction.util";

vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/lockAITransaction.util",
  () => ({ lockAITransaction: vi.fn(async () => undefined) }),
);

vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/payloadTransaction",
  () => ({
    withPayloadTransaction: async (
      _req: unknown,
      work: () => Promise<unknown>,
    ) => work(),
  }),
);

const intent: UpdatePageStructureDraftIntent = {
  version: "1.0",
  kind: "pages.updateStructureDraft.v1",
  pageID: "19",
  expectedUpdatedAt: "2026-09-13T10:00:00.000Z",
  expectedFingerprint: "c".repeat(64),
  expectedCatalogHash: "d".repeat(64),
  operation: { type: "remove", blockID: "content-a" },
};
const preview: PageDraftStructurePreviewDTO = {
  page: { id: "19", title: "Доставка", slug: "delivery" },
  status: "draft",
  action: "remove",
  blockID: "content-a",
  beforeIndex: 1,
  afterIndex: null,
  beforeBlockID: null,
  totalBefore: 3,
  totalAfter: 2,
  content: {
    columns: [
      { size: "full", text: "Весь текст удаляемого блока\nПоследняя строка" },
    ],
  },
};
const snapshot: PageDraftStructureSnapshot = {
  context: {
    page: preview.page,
    updatedAt: intent.expectedUpdatedAt,
    fingerprint: intent.expectedFingerprint,
    knowledge: {
      version: "1.0",
      pageID: "19",
      fingerprint: intent.expectedFingerprint,
      catalogHash: intent.expectedCatalogHash,
      definitions: [],
      outline: {
        offset: 0,
        limit: 32,
        totalBlocks: 3,
        nextOffset: null,
        blocks: [],
      },
    },
  },
  beforePage: { id: 19, privatePayloadField: "private-before" },
  expectedPage: { id: 19, privatePayloadField: "private-after" },
  writeData: { layout: ["private-layout"] },
  baseFingerprint: "a".repeat(64),
  publicationFingerprint: "b".repeat(64),
  adapterVersion: "1.0",
  preview,
};
const payload = { db: { defaultIDType: "number" } } as unknown as Payload;
const req = { payload } as PayloadRequest;
let operation: AIDocument;
let messages: AIDocument[];

beforeEach(() => {
  vi.restoreAllMocks();
  operation = {
    id: 91,
    kind: intent.kind,
    intent,
    beforeSnapshot: snapshot.beforePage,
    afterSnapshot: snapshot,
    operationHash: "e".repeat(64),
    rollbackHash: "f".repeat(64),
    conversation: 2,
    sourceMessage: 5,
    requestedBy: 1,
    version: 1,
    state: "awaiting_approval",
    expiresAt: "2099-01-01T00:00:00Z",
  };
  messages = [
    {
      id: 4,
      role: "user",
      runID: "7",
      content: "Удали указанный Content",
      sequence: 1,
    },
    {
      id: 6,
      role: "user",
      runID: "8",
      content: "Другой запрос из второй вкладки",
      sequence: 2,
    },
    {
      id: 5,
      role: "assistant",
      runID: "7",
      content: "План удаления",
      sequence: 3,
    },
  ];
  vi.spyOn(AIRepository.prototype, "getConversationDetail").mockImplementation(
    async () => ({ conversation: { id: 2 }, messages, runs: [] }),
  );
  vi.spyOn(
    DataOperationRepository.prototype,
    "findByIdempotencyKey",
  ).mockResolvedValue(undefined);
  vi.spyOn(
    DataOperationRepository.prototype,
    "findBySourceMessage",
  ).mockResolvedValue(undefined);
  vi.spyOn(
    DataOperationRepository.prototype,
    "createOperation",
  ).mockImplementation(async (input) => ({ id: 91, ...input }));
  vi.spyOn(
    DataOperationRepository.prototype,
    "getOwnedOperation",
  ).mockImplementation(async () => operation);
  vi.spyOn(DataOperationRepository.prototype, "transition").mockImplementation(
    async ({ data }) => {
      operation = { ...operation, ...data };
      return operation;
    },
  );
  vi.spyOn(
    DataOperationAuditRepository.prototype,
    "createEvent",
  ).mockResolvedValue({ id: 101 });
  vi.spyOn(
    DataOperationAuditRepository.prototype,
    "getApproval",
  ).mockResolvedValue(undefined);
  vi.spyOn(PageDraftStructure.prototype, "dryRun").mockResolvedValue(snapshot);
  vi.spyOn(PageDraftStructure.prototype, "apply").mockResolvedValue({
    appliedSnapshot: {
      pageID: "19",
      title: "Доставка",
      slug: "delivery",
      adminUrl: "/admin/collections/pages/19",
      updatedAt: "2026-09-13T10:01:00.000Z",
      fingerprint: "1".repeat(64),
      adapterVersion: "1.0",
      catalogHash: intent.expectedCatalogHash,
    },
    rollbackHash: "2".repeat(64),
  });
  vi.spyOn(PageDraftStructure.prototype, "rollback").mockResolvedValue(
    "2026-09-13T10:02:00.000Z",
  );
  vi.spyOn(PageDraftUpdate.prototype, "apply");
  vi.spyOn(PageDraftUpdate.prototype, "rollback");
  vi.spyOn(CatalogCategoryAssignment.prototype, "apply");
  vi.spyOn(CatalogCategoryAssignment.prototype, "rollback");
});

const plan = () =>
  createTypedDataOperationPlan({
    payload,
    req,
    userID: 1,
    conversationID: "2",
    sourceMessageID: "5",
    intent,
    source: { type: "assistant", idempotencyKey: "structure-plan" },
  });
const apply = () =>
  applyDataOperation({
    payload,
    req,
    userID: 1,
    dataOperationID: "91",
    data: { expectedVersion: 1, expectedOperationHash: "e".repeat(64) },
  });
const rollback = () =>
  rollbackDataOperation({
    payload,
    req,
    userID: 1,
    dataOperationID: "91",
    expectedVersion: 1,
    expectedRollbackHash: "f".repeat(64),
  });
const approve = (type: "WRITE_CONFIRMATION" | "ROLLBACK_APPROVAL") => {
  const targetHash =
    type === "WRITE_CONFIRMATION"
      ? String(operation.operationHash)
      : String(operation.rollbackHash);
  const expiresAt = String(operation.expiresAt);
  vi.mocked(
    DataOperationAuditRepository.prototype.getApproval,
  ).mockResolvedValue({
    id: 3,
    actor: 1,
    roleSnapshot: ["admin"],
    type,
    decision: "approved",
    expiresAt,
    targetHash,
    operationVersion: 1,
    boundHash: createDataOperationApprovalBinding({
      actorID: "1",
      actorRoles: ["admin"],
      approvalType: type,
      dataOperationID: "91",
      decision: "approved",
      expiresAt,
      targetHash,
      version: 1,
    }),
  });
};

describe("structure Data Lane dispatch", () => {
  it("prepares a draft preview with the request from the same run and its own rollback hash", async () => {
    const result = await plan();
    expect(result.kind).toBe(intent.kind);
    expect(result.originalRequest).toBe("Удали указанный Content");
    expect(result.afterSnapshot).toEqual(snapshot);
    expect(result.expectedTargetUpdatedAt).toBe(intent.expectedUpdatedAt);
    expect(result.rollbackHash).toBe(
      createPageDraftStructureRollbackHash({
        operationHash: String(result.operationHash),
      }),
    );
    expect(
      DataOperationAuditRepository.prototype.createEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "preview_created",
        payload: expect.objectContaining({ kind: intent.kind }),
      }),
    );
    expect(PageDraftStructure.prototype.apply).not.toHaveBeenCalled();
  });
  it("rejects a missing same-run request before creating a plan", async () => {
    messages = messages.filter((message) => message.id !== 4);
    await expect(plan()).rejects.toMatchObject({ status: 400 });
    expect(PageDraftStructure.prototype.dryRun).not.toHaveBeenCalled();
  });
  it("rejects direct workflow structural planning without consulting selectors", async () => {
    await expect(
      createTypedDataOperationPlan({
        payload,
        req,
        userID: 1,
        conversationID: "2",
        sourceMessageID: "5",
        intent,
        source: {
          type: "workflow",
          rootRunID: "7",
          stepKey: "edit",
          compiledContextHash: "c".repeat(64),
          capabilityBindingKey: "struct",
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(PageDraftStructure.prototype.dryRun).not.toHaveBeenCalled();
  });
  it("replays the exact prior plan and rejects a substituted intent", async () => {
    vi.mocked(
      DataOperationRepository.prototype.findByIdempotencyKey,
    ).mockResolvedValue(operation);
    expect(await plan()).toBe(operation);
    expect(PageDraftStructure.prototype.dryRun).not.toHaveBeenCalled();
    operation.intent = {
      ...intent,
      operation: { type: "remove", blockID: "another-block" },
    };
    await expect(plan()).rejects.toMatchObject({ status: 409 });
  });
  it("applies only after a valid exact-hash approval and dispatches to the structural service", async () => {
    operation.state = "approved";
    await expect(apply()).rejects.toMatchObject({ status: 409 });
    expect(PageDraftStructure.prototype.apply).not.toHaveBeenCalled();
    approve("WRITE_CONFIRMATION");
    const applied = await apply();
    expect(applied.state).toBe("applied");
    expect(applied.version).toBe(2);
    expect(applied.rollbackHash).toBe("2".repeat(64));
    expect(PageDraftStructure.prototype.apply).toHaveBeenCalledOnce();
    expect(PageDraftUpdate.prototype.apply).not.toHaveBeenCalled();
    expect(CatalogCategoryAssignment.prototype.apply).not.toHaveBeenCalled();
    expect(await apply()).toBe(applied);
    expect(PageDraftStructure.prototype.apply).toHaveBeenCalledOnce();
  });
  it("requires a separate rollback confirmation and preserves the structural executor", async () => {
    operation.state = "rollback_approved";
    await expect(rollback()).rejects.toMatchObject({ status: 409 });
    approve("ROLLBACK_APPROVAL");
    const restored = await rollback();
    expect(restored.state).toBe("rolled_back");
    expect(restored.version).toBe(2);
    expect(PageDraftStructure.prototype.rollback).toHaveBeenCalledOnce();
    expect(PageDraftUpdate.prototype.rollback).not.toHaveBeenCalled();
    expect(CatalogCategoryAssignment.prototype.rollback).not.toHaveBeenCalled();
  });
  it.each(["apply", "rollback"])(
    "never treats an unknown kind as a category operation during %s",
    async (action) => {
      operation.kind = "unknown.change.v1";
      operation.state = action === "apply" ? "approved" : "rollback_approved";
      approve(action === "apply" ? "WRITE_CONFIRMATION" : "ROLLBACK_APPROVAL");
      await expect(
        action === "apply" ? apply() : rollback(),
      ).rejects.toMatchObject({ status: 400 });
      expect(CatalogCategoryAssignment.prototype.apply).not.toHaveBeenCalled();
      expect(
        CatalogCategoryAssignment.prototype.rollback,
      ).not.toHaveBeenCalled();
    },
  );
  it("records a structural apply conflict without returning a successful transition", async () => {
    operation.state = "approved";
    approve("WRITE_CONFIRMATION");
    vi.mocked(PageDraftStructure.prototype.apply).mockRejectedValue(
      new EndpointError("CONFLICT", "Ревизия изменилась", 409),
    );
    await expect(apply()).rejects.toMatchObject({ status: 409 });
    expect(operation.state).toBe("apply_failed");
    expect(lockAITransaction).toHaveBeenCalledWith(req, "page-drafts");
    expect(
      DataOperationAuditRepository.prototype.createEvent,
    ).toHaveBeenCalledWith(expect.objectContaining({ type: "apply_failed" }));
  });
});

describe("structure browser projection", () => {
  it("exposes the complete approved content and no raw page, layout or private snapshot", () => {
    const dto = toDataOperationDTO({ operation });
    expect(dto.kind).toBe(intent.kind);
    expect(dto.preview).toEqual(preview);
    expect(JSON.stringify(dto)).not.toMatch(
      /private-before|private-after|private-layout|expectedPage|writeData|catalogHash/,
    );
    expect(dto).not.toHaveProperty("intent");
    expect(dto).not.toHaveProperty("result");
  });
  it("projects the real editor result only for applied states", () => {
    operation.appliedSnapshot = {
      pageID: "19",
      title: "Доставка",
      slug: "delivery",
      adminUrl: "/custom-admin/collections/pages/19",
      catalogHash: "d".repeat(64),
      fingerprint: "1".repeat(64),
    };
    operation.state = "applied";
    expect(toDataOperationDTO({ operation })).toHaveProperty("result", {
      page: preview.page,
      adminUrl: "/custom-admin/collections/pages/19",
      frontendPreviewUrl: "/api/realize-ai/data-operations/91/open-page",
    });
    operation.state = "rolled_back";
    expect(toDataOperationDTO({ operation })).not.toHaveProperty("result");
  });
  it("rejects a snapshot that describes another action or target", () => {
    operation.afterSnapshot = {
      ...snapshot,
      preview: { ...preview, blockID: "wrong-block" },
    };
    expect(() => toDataOperationDTO({ operation })).toThrow(
      "Предпросмотр не соответствует",
    );
  });
  it("rejects unknown kinds rather than fabricating a category preview", () => {
    operation.kind = "unknown.change.v1";
    expect(() => toDataOperationDTO({ operation })).toThrow(
      "Тип операции данных не поддерживается",
    );
  });
});
