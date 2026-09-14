// @vitest-environment node
/**
 * @file tests/int/pageStructureProvenance.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет происхождение структурных IDs и ревизии из сохранённых чтений исходного run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import {
  parsePageStructureContext,
  type PageDraftContextDTO,
  type PageStructureContextDTO,
  type UpdatePageStructureDraftIntent,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { matchesPageStructureContext } from "../../packages/payload-ai-plugin/src/chat-context/pageStructureContext.validator";
import type { ChatRunContext } from "../../packages/payload-ai-plugin/src/chat-context/ChatRunContext.types";
import { createDataOperationPlan } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationPlanning";
import {
  AIRepository,
  type AIDocument,
} from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import { pageKnowledgeAdapter } from "../../src/collections/Pages/pageKnowledge.adapter";
import { Pages } from "../../src/collections/Pages";

const mocks = vi.hoisted(() => ({ createPlan: vi.fn() }));
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/createTypedDataOperationPlan.service",
  () => ({ createTypedDataOperationPlan: mocks.createPlan }),
);
const definitions = pageKnowledgeAdapter.definitions(Pages.fields);
const structure = (offset = 0): PageStructureContextDTO =>
  parsePageStructureContext({
    page: { id: "19", title: "Доставка" },
    updatedAt: "2026-09-13T09:00:00.000Z",
    fingerprint: "c".repeat(64),
    knowledge: {
      version: "1.0",
      pageID: "19",
      fingerprint: "c".repeat(64),
      catalogHash: hashCanonicalJSON(definitions),
      definitions: definitions.filter((definition) =>
        ["pages", "blocks.content"].includes(definition.id),
      ),
      outline: pageKnowledgeAdapter.outline(
        {
          layout: Array.from({ length: 40 }, (_, i) => ({
            id: `block${i}`,
            blockType: "content",
            columns: [],
          })),
        },
        offset,
      ),
    },
  });
const textContext = (): PageDraftContextDTO => ({
  ...structure(),
  adapterVersion: "1.0",
  fields: [
    { path: "/title", label: "Название", value: "Доставка", maxLength: 160 },
  ],
});
const intent = (): UpdatePageStructureDraftIntent => ({
  version: "1.0",
  kind: "pages.updateStructureDraft.v1",
  pageID: "19",
  expectedUpdatedAt: structure().updatedAt,
  expectedFingerprint: structure().fingerprint,
  expectedCatalogHash: structure().knowledge.catalogHash,
  operation: { type: "move", blockID: "block1", beforeBlockID: "block3" },
});
const context = (): ChatRunContext => ({
  runtimeContextHash: "fixture",
  attachments: [],
  projectFiles: [],
  webSearch: false,
  pageDiscoveryEnabled: true,
});
const appendStructure = (stored: ChatRunContext, offset = 0) => {
  const snapshot = structure(offset);
  const arguments_ = {
    pageID: "19",
    ...(offset
      ? {
          offset,
          fingerprint: snapshot.fingerprint,
          catalogHash: snapshot.knowledge.catalogHash,
        }
      : {}),
  };
  const callID = `structure-${offset}`;
  const requestHash = hashCanonicalJSON({
    name: "pages_structure",
    arguments: arguments_,
  });
  stored.pageDiscoveryCalls = [
    ...(stored.pageDiscoveryCalls ?? []),
    { callID, name: "pages_structure", requestHash, status: "completed" },
  ];
  stored.pageStructureReadContexts = [
    ...(stored.pageStructureReadContexts ?? []),
    { callID, requestHash, arguments: arguments_, context: snapshot },
  ];
  return stored;
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.createPlan.mockResolvedValue({ id: 91 });
});

describe("Структурный план из ограниченного контекста страницы", () => {
  it("принимает ручной выбор с knowledge и не требует журнал tool calls для этого источника", () => {
    const stored = {
      ...context(),
      pageDiscoveryEnabled: false,
      pageDraftContext: textContext(),
    };
    expect(matchesPageStructureContext(stored, intent())).toBe(true);
  });
  it("принимает только completed pages_read с совпадающим requestHash", () => {
    const requestHash = hashCanonicalJSON({
      name: "pages_read",
      arguments: { pageID: "19" },
    });
    const stored: ChatRunContext = {
      ...context(),
      pageReadContexts: [
        { callID: "read", requestHash, context: textContext() },
      ],
      pageDiscoveryCalls: [
        {
          callID: "read",
          requestHash,
          name: "pages_read",
          status: "completed",
        },
      ],
    };
    expect(matchesPageStructureContext(stored, intent())).toBe(true);
    stored.pageDiscoveryCalls![0].status = "pending";
    expect(matchesPageStructureContext(stored, intent())).toBe(false);
    stored.pageDiscoveryCalls![0].status = "completed";
    stored.pageReadContexts![0].requestHash = "a".repeat(64);
    expect(matchesPageStructureContext(stored, intent())).toBe(false);
  });
  it("собирает target и anchor из разных порций той же ревизии", () => {
    const stored = appendStructure(context());
    const command = {
      ...intent(),
      operation: {
        type: "move" as const,
        blockID: "block1",
        beforeBlockID: "block35",
      },
    };
    expect(matchesPageStructureContext(stored, command)).toBe(false);
    appendStructure(stored, 32);
    expect(matchesPageStructureContext(stored, command)).toBe(true);
  });
  it("не смешивает target старой ревизии с anchor из новой порции", () => {
    const stored = appendStructure(appendStructure(context()), 32);
    const record = stored.pageStructureReadContexts![1];
    record.context.fingerprint = "e".repeat(64);
    record.context.knowledge.fingerprint = "e".repeat(64);
    record.arguments.fingerprint = "e".repeat(64);
    record.requestHash = hashCanonicalJSON({
      name: "pages_structure",
      arguments: record.arguments,
    });
    stored.pageDiscoveryCalls![1].requestHash = record.requestHash;
    expect(
      matchesPageStructureContext(stored, {
        ...intent(),
        operation: {
          type: "move",
          blockID: "block1",
          beforeBlockID: "block35",
        },
      }),
    ).toBe(false);
  });
  it("вставка в конец требует прочитанной страницы, вставка перед блоком — прочитанного anchor", () => {
    const command = {
      ...intent(),
      operation: {
        type: "insert" as const,
        beforeBlockID: null,
        section: { body: "Новый текст" },
      },
    };
    expect(matchesPageStructureContext(context(), command)).toBe(false);
    const stored = appendStructure(context());
    expect(matchesPageStructureContext(stored, command)).toBe(true);
    expect(
      matchesPageStructureContext(stored, {
        ...command,
        operation: { ...command.operation, beforeBlockID: "unseen" },
      }),
    ).toBe(false);
  });
  it.each([
    "unseen-target",
    "unseen-anchor",
    "missing-id",
    "duplicate-id",
    "foreign-page",
    "fingerprint",
    "timestamp",
    "catalog",
    "missing-ledger",
    "pending-ledger",
    "request-hash",
    "argument-hash",
    "wrong-offset",
    "disabled",
    "workflow",
  ])("отклоняет неподтверждённый источник: %s", (reason) => {
    const stored = appendStructure(context());
    const command = intent();
    const snapshot = stored.pageStructureReadContexts![0].context;
    if (reason === "unseen-target")
      command.operation = { type: "remove", blockID: "unseen" };
    if (reason === "unseen-anchor")
      command.operation = {
        type: "move",
        blockID: "block1",
        beforeBlockID: "unseen",
      };
    if (reason === "missing-id") {
      snapshot.knowledge.outline.blocks[1].id = null;
      snapshot.knowledge.outline.blocks[1].identity = "missing";
    }
    if (reason === "duplicate-id")
      snapshot.knowledge.outline.blocks[1].identity = "duplicate";
    if (reason === "foreign-page") command.pageID = "20";
    if (reason === "fingerprint") command.expectedFingerprint = "d".repeat(64);
    if (reason === "timestamp")
      command.expectedUpdatedAt = "2026-09-13T08:00:00.000Z";
    if (reason === "catalog") command.expectedCatalogHash = "d".repeat(64);
    if (reason === "missing-ledger") stored.pageDiscoveryCalls = [];
    if (reason === "pending-ledger")
      stored.pageDiscoveryCalls![0].status = "pending";
    if (reason === "request-hash")
      stored.pageStructureReadContexts![0].requestHash = "d".repeat(64);
    if (reason === "argument-hash")
      stored.pageStructureReadContexts![0].arguments.pageID = "20";
    if (reason === "wrong-offset") {
      const record = stored.pageStructureReadContexts![0];
      record.arguments = {
        pageID: "19",
        offset: 32,
        fingerprint: snapshot.fingerprint,
        catalogHash: snapshot.knowledge.catalogHash,
      };
      record.requestHash = hashCanonicalJSON({
        name: "pages_structure",
        arguments: record.arguments,
      });
      stored.pageDiscoveryCalls![0].requestHash = record.requestHash;
    }
    if (reason === "disabled") stored.pageDiscoveryEnabled = false;
    if (reason === "workflow") stored.workflow = {} as never;
    expect(matchesPageStructureContext(stored, command)).toBe(false);
  });
  it("не принимает другой тип блока в качестве редактируемого target", () => {
    const stored = appendStructure(context());
    const block =
      stored.pageStructureReadContexts![0].context.knowledge.outline.blocks[1];
    Object.assign(block, {
      blockType: "mediaBlock",
      definitionID: null,
      settings: [],
      references: [],
    });
    expect(matchesPageStructureContext(stored, intent())).toBe(false);
  });
});

describe("Подготовка плана из конкретного ответа ассистента", () => {
  it("читает только run выбранного ответа и не заимствует порции соседнего run", async () => {
    const source = {
      id: 7,
      conversation: 2,
      requestedBy: 1,
      turnContext: appendStructure(context()),
    } as AIDocument;
    const other = {
      id: 8,
      conversation: 2,
      requestedBy: 1,
      turnContext: context(),
    } as AIDocument;
    const assistant = {
      id: 5,
      role: "assistant",
      sequence: 2,
      runID: "7",
      content: `\`\`\`realize-data-operation\n${JSON.stringify(intent())}\n\`\`\``,
    };
    const payload = {
      db: { defaultIDType: "number" },
    } as PayloadRequest["payload"];
    const req = { payload } as PayloadRequest;
    vi.spyOn(AIRepository.prototype, "getConversationDetail").mockResolvedValue(
      {
        conversation: { id: 2 },
        runs: [source, other],
        messages: [{ id: 4, role: "user", runID: "7", sequence: 1 }, assistant],
      },
    );
    const getRun = vi
      .spyOn(AIRepository.prototype, "getRun")
      .mockImplementation(async (id) => (id === "7" ? source : other));
    vi.spyOn(
      DataOperationRepository.prototype,
      "findByIdempotencyKey",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      DataOperationRepository.prototype,
      "findBySourceMessage",
    ).mockResolvedValue(undefined);
    const input = {
      req,
      payload,
      userID: 1,
      conversationID: "2",
      sourceMessageID: "5",
      idempotencyKey: "one",
    };
    await expect(createDataOperationPlan(input)).resolves.toEqual({ id: 91 });
    expect(getRun).toHaveBeenLastCalledWith("7", 1);
    expect(mocks.createPlan).toHaveBeenCalledTimes(1);
    assistant.runID = "8";
    await expect(createDataOperationPlan(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(getRun).toHaveBeenLastCalledWith("8", 1);
    expect(mocks.createPlan).toHaveBeenCalledTimes(1);
    assistant.runID = "7";
    source.conversation = 99;
    await expect(createDataOperationPlan(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.createPlan).toHaveBeenCalledTimes(1);
  });
});
