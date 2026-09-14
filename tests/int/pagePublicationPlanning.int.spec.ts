// @vitest-environment node
/**
 * @file tests/int/pagePublicationPlanning.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-14
 * @description Проверяет durable replay публикации и исключение только восстановления из запрета новых AI записей.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../packages/payload-ai-plugin/src/constants";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import { DataOperationAuditRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationAuditRepository";
import { PagePublication } from "../../packages/payload-ai-plugin/src/endpoints/pagePublication.service";
import { preparePagePublication } from "../../packages/payload-ai-plugin/src/endpoints/pagePublicationPlanning.service";
import { requireDataOperationWriteTool } from "../../packages/payload-ai-plugin/src/endpoints/requireDataOperationWriteTool.service";
import { requireCodexChatTool } from "../../packages/payload-ai-plugin/src/endpoints/requireCodexChatTool.service";
import { EndpointError } from "../../packages/payload-ai-plugin/src/endpoints/http";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { PagePublicationSnapshot } from "../../packages/payload-ai-plugin/src/endpoints/PagePublication.types";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/requireCodexChatTool.service",
  () => ({
    requireCodexChatTool: vi.fn(async () => {
      throw new EndpointError("AI_DISABLED", "Агент выключен", 409);
    }),
  }),
);
afterEach(() => vi.restoreAllMocks());
const hash = "a".repeat(64);
const fixture = () => {
  const records = new Map<string, AIDocument>([
    [
      "1",
      {
        id: 1,
        conversation: 4,
        sourceMessage: 5,
        kind: "pages.updateDraft.v1",
      },
    ],
  ]);
  let created: AIDocument | undefined;
  let event: AIDocument | undefined;
  const canPublish = vi.fn(async () => true);
  const payload = {
    config: {
      custom: {
        [REALIZE_AI_SERVER_RUNTIME_KEY]: {
          canUseChat: async () => true,
          canManageData: async () => true,
          pageDraft: {
            publication: {
              version: "1.0",
              canPublish,
              check: vi.fn(),
              revalidate: vi.fn(),
            },
          },
        },
      },
    },
    db: {
      name: "postgres",
      defaultIDType: "number",
      sessions: { tx: { db: { execute: vi.fn(async () => {}) } } },
    },
  } as unknown as Payload;
  const req = {
    payload,
    user: { id: 1 },
    transactionID: "tx",
  } as PayloadRequest;
  const page = {
    id: 7,
    title: "Доставка",
    slug: "delivery",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
  const ref = { id: "7", title: "Доставка", slug: "delivery" };
  const snapshot: PagePublicationSnapshot = {
    version: "1.0",
    mode: "publish",
    source: { id: "1", version: 3, operationHash: hash },
    revision: {
      page,
      baseFingerprint: hash,
      publicationFingerprint: hash,
      latestVersion: { id: "8", updatedAt: String(page.updatedAt) },
    },
    beforePage: page,
    targetPage: page,
    preservedDraft: page,
    preview: {
      page: ref,
      sourceOperationID: "1",
      manifestHash: hash,
      policyHash: hash,
      checks: [
        {
          id: "static",
          status: "passed",
          severity: "info",
          message: "Проверено.",
        },
      ],
      before: { page: ref, status: "unpublished" },
      after: { page: ref, status: "published" },
    },
  };
  const prepare = vi
    .spyOn(PagePublication.prototype, "prepare")
    .mockResolvedValue({
      snapshot,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    });
  vi.spyOn(
    DataOperationRepository.prototype,
    "getOwnedOperation",
  ).mockImplementation(async (id, actor) => {
    if (String(actor) !== "1" || !records.has(id))
      throw new EndpointError("NOT_FOUND", "Unavailable fixture", 404);
    return records.get(id)!;
  });
  vi.spyOn(
    DataOperationRepository.prototype,
    "findByIdempotencyKey",
  ).mockImplementation(async () => created);
  const create = vi
    .spyOn(DataOperationRepository.prototype, "createOperation")
    .mockImplementation(async (input) => {
      created = { id: 2, ...input, state: "awaiting_approval", version: 1 };
      records.set("2", created);
      return created;
    });
  vi.spyOn(
    DataOperationAuditRepository.prototype,
    "getPreviewEvent",
  ).mockImplementation(async () => event);
  vi.spyOn(
    DataOperationAuditRepository.prototype,
    "createEvent",
  ).mockImplementation(async (input) => {
    event = { id: 3, ...input };
    return event;
  });
  const input = {
    expectedVersion: 3,
    expectedOperationHash: hash,
  };
  return {
    req,
    records,
    prepare,
    create,
    input,
    canPublish,
    run: () =>
      preparePagePublication(req, "1", input, "publish", "same-fixture-key"),
  };
};
describe("План публикации и recovery policy", () => {
  it("создаёт новый source key и возвращает прежний план без повторного prepare", async () => {
    const f = fixture();
    const first = await f.run();
    expect(first).toMatchObject({
      kind: "pages.publishDraft.v1",
      riskLevel: "R2",
      rollbackStrategy: "restore-publication",
      conversationID: "4",
      sourceMessageID: "5",
    });
    expect(first.sourceMessageKey).not.toBe("4:5");
    f.prepare.mockRejectedValue(new Error("expired fixture plan"));
    expect(await f.run()).toEqual(first);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.prepare).toHaveBeenCalledTimes(1);
  });
  it("не принимает другой body или потерю права на replay", async () => {
    const f = fixture();
    await f.run();
    f.input.expectedVersion = 4;
    await expect(f.run()).rejects.toMatchObject({ status: 409 });
    f.canPublish.mockResolvedValue(false);
    await expect(f.run()).rejects.toMatchObject({ status: 403 });
  });
  it("выключение AI запрещает публикацию, но не подтверждаемое восстановление", async () => {
    const f = fixture();
    const options = { enabled: false } as SanitizedRealizeAIPluginOptions;
    f.records.set("1", { id: 1, kind: "pages.publishDraft.v1" });
    await expect(
      requireDataOperationWriteTool(f.req, "1", options),
    ).rejects.toMatchObject({ code: "AI_DISABLED" });
    vi.mocked(requireCodexChatTool).mockClear();
    f.records.set("1", { id: 1, kind: "pages.restorePublication.v1" });
    await requireDataOperationWriteTool(f.req, "1", options);
    expect(requireCodexChatTool).not.toHaveBeenCalled();
  });
});
