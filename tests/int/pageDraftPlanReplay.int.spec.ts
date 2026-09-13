// @vitest-environment node
/**
 * @file tests/int/pageDraftPlanReplay.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Проверяет привязку плана черновика к исходному запуску и точному повторному запросу.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import type {
  PageDraftContextDTO,
  UpdatePageDraftIntent,
} from "@realize/ai-contracts";
import { createDataOperationPlan } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationPlanning";
import { createTypedDataOperationPlan } from "../../packages/payload-ai-plugin/src/endpoints/createTypedDataOperationPlan.service";
import {
  AIRepository,
  type AIDocument,
} from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import { DataOperationAuditRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationAuditRepository";
import { PageDraftUpdate } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service";
import type { PageDraftUpdateSnapshot } from "../../packages/payload-ai-plugin/src/endpoints/PageDraftUpdate.types";

// Транзакцию и хранилища заменяем локальными doubles; обе границы планирования остаются настоящими.
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/payloadTransaction",
  () => ({
    withPayloadTransaction: async <T>(
      _req: PayloadRequest,
      work: () => Promise<T>,
    ) => await work(),
  }),
);

const context: PageDraftContextDTO = {
  page: { id: "19", title: "О компании", slug: "about" },
  updatedAt: "2026-09-12T10:00:00.000Z",
  fingerprint: "c".repeat(64),
  adapterVersion: "1.0",
  fields: [
    { path: "/title", label: "Заголовок", value: "О компании", maxLength: 160 },
  ],
};
const intent: UpdatePageDraftIntent = {
  kind: "pages.updateDraft.v1",
  version: "1.0",
  pageID: "19",
  expectedUpdatedAt: context.updatedAt,
  expectedFingerprint: context.fingerprint,
  changes: [{ path: "/title", before: "О компании", after: "О нас" }],
};
const beforePage: AIDocument = {
  id: 19,
  title: "О компании",
  slug: "about",
  _status: "draft",
  updatedAt: context.updatedAt,
};
const snapshot: PageDraftUpdateSnapshot = {
  context,
  beforePage,
  writeData: { title: "О нас" },
  expectedPage: { ...beforePage, title: "О нас" },
  baseFingerprint: "a".repeat(64),
  publicationFingerprint: "b".repeat(64),
  preview: {
    page: context.page,
    changes: [{ ...intent.changes[0], label: "Заголовок" }],
    status: "draft",
  },
};

beforeEach(() => vi.restoreAllMocks());

const fixture = () => {
  const payload = { db: { defaultIDType: "number" } } as unknown as Payload;
  const request = {
    payload,
    req: { payload } as PayloadRequest,
    userID: 1,
    conversationID: "2",
    idempotencyKey: "draft-plan-key",
    sourceMessageID: "5",
  };
  const messages: AIDocument[] = [
    {
      id: 4,
      role: "user",
      sequence: 1,
      runID: "7",
      content: "Сократи заголовок страницы О компании",
    },
    {
      id: 6,
      role: "user",
      sequence: 2,
      runID: "8",
      content: "Другой запрос из второй вкладки",
    },
    {
      id: 5,
      role: "assistant",
      sequence: 3,
      runID: "7",
      content: "```realize-data-operation\n" + JSON.stringify(intent) + "\n```",
    },
  ];
  vi.spyOn(AIRepository.prototype, "getConversationDetail").mockResolvedValue({
    conversation: { id: 2 },
    messages,
    runs: [],
  });
  const getRun = vi.spyOn(AIRepository.prototype, "getRun").mockResolvedValue({
    id: 7,
    conversation: 2,
    turnContext: { pageDraftContext: context },
  });
  const byKey = vi
    .spyOn(DataOperationRepository.prototype, "findByIdempotencyKey")
    .mockResolvedValue(undefined);
  const bySource = vi
    .spyOn(DataOperationRepository.prototype, "findBySourceMessage")
    .mockResolvedValue(undefined);
  const create = vi
    .spyOn(DataOperationRepository.prototype, "createOperation")
    .mockImplementation(async (input) => ({ id: 91, ...input }));
  const audit = vi
    .spyOn(DataOperationAuditRepository.prototype, "createEvent")
    .mockResolvedValue({ id: 101 });
  const dryRun = vi
    .spyOn(PageDraftUpdate.prototype, "dryRun")
    .mockResolvedValue(snapshot);
  const existing = (changes: Partial<AIDocument> = {}): AIDocument => ({
    id: 91,
    conversation: 2,
    sourceMessage: 5,
    requestedBy: 1,
    intent,
    state: "awaiting_approval",
    ...changes,
  });
  const plan = (boundary: "public" | "typed") =>
    boundary === "public"
      ? createDataOperationPlan(request)
      : createTypedDataOperationPlan({
          ...request,
          intent,
          source: { type: "assistant", idempotencyKey: request.idempotencyKey },
        });
  return {
    plan,
    messages,
    getRun,
    byKey,
    bySource,
    create,
    audit,
    dryRun,
    existing,
  };
};

describe.each(["public", "typed"] as const)(
  "page draft plan %s boundary",
  (boundary) => {
    it("сохраняет запрос того же run при ответах, пришедших после другого сообщения", async () => {
      const f = fixture();
      await f.plan(boundary);
      expect(f.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalRequest: "Сократи заголовок страницы О компании",
          sourceMessageID: "5",
          intent,
        }),
      );
      expect(f.dryRun).toHaveBeenCalledTimes(1);
      expect(f.audit).toHaveBeenCalledTimes(1);
    });

    it("не подменяет отсутствующий запрос исходного run более поздним сообщением", async () => {
      const f = fixture();
      f.messages.shift();
      await expect(f.plan(boundary)).rejects.toMatchObject({ status: 400 });
      expect(f.create).not.toHaveBeenCalled();
      expect(f.dryRun).not.toHaveBeenCalled();
    });

    it.each([
      ["диалог", { conversation: 3 }],
      ["ответ", { sourceMessage: 9 }],
      ["владелец", { requestedBy: 2 }],
      [
        "intent",
        {
          intent: {
            ...intent,
            changes: [{ ...intent.changes[0], after: "Другой заголовок" }],
          },
        },
      ],
    ] as const)(
      "отклоняет тот же ключ, если изменён %s",
      async (_label, changes) => {
        const f = fixture();
        f.byKey.mockResolvedValue(f.existing(changes));
        await expect(f.plan(boundary)).rejects.toMatchObject({ status: 409 });
        expect(f.dryRun).not.toHaveBeenCalled();
        expect(f.create).not.toHaveBeenCalled();
        expect(f.audit).not.toHaveBeenCalled();
      },
    );

    it.each(["awaiting_approval", "applied"])(
      "возвращает точный replay в состоянии %s без повторного dry-run",
      async (state) => {
        const f = fixture();
        const operation = f.existing({ state });
        f.byKey.mockResolvedValue(operation);
        await expect(f.plan(boundary)).resolves.toBe(operation);
        expect(f.getRun).not.toHaveBeenCalled();
        expect(f.dryRun).not.toHaveBeenCalled();
        expect(f.create).not.toHaveBeenCalled();
        expect(f.audit).not.toHaveBeenCalled();
      },
    );

    it("возвращает уже применённый план того же ответа при новом ключе", async () => {
      const f = fixture();
      const operation = f.existing({ state: "applied" });
      f.bySource.mockResolvedValue(operation);
      await expect(f.plan(boundary)).resolves.toBe(operation);
      expect(f.dryRun).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
      expect(f.audit).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      "проверяет совпадение запроса при concurrent insert, другой источник=%s",
      async (foreign) => {
        const f = fixture();
        const operation = f.existing(foreign ? { sourceMessage: 9 } : {});
        f.byKey.mockResolvedValue(operation);
        for (let count = 0; count < (boundary === "public" ? 2 : 1); count++)
          f.byKey.mockResolvedValueOnce(undefined);
        f.create.mockRejectedValueOnce(new Error("duplicate key"));
        if (foreign)
          await expect(f.plan(boundary)).rejects.toMatchObject({ status: 409 });
        else await expect(f.plan(boundary)).resolves.toBe(operation);
        expect(f.create).toHaveBeenCalledTimes(1);
        expect(f.dryRun).toHaveBeenCalledTimes(1);
        expect(f.audit).not.toHaveBeenCalled();
      },
    );
  },
);
