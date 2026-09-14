// @vitest-environment node
/**
 * @file tests/int/pageStructureService.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет structural dry-run, revision guards, точный apply/rollback и ACL.
 */
import type { UpdatePageStructureDraftIntent } from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { Locked, type Payload, type PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../packages/payload-ai-plugin/src/constants";
import { PageDraftStructure } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftStructure.service";
import { PageDraftUpdate } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { mapAIPageDraftContent } from "../../src/collections/Pages/mapAIPageDraft.mapper";
import { pageDraftTextAdapter } from "../../src/collections/Pages/pageDraftText.adapter";
import { pageKnowledgeAdapter } from "../../src/collections/Pages/pageKnowledge.adapter";
import { pageStructureAdapter } from "../../src/collections/Pages/pageStructure.adapter";
import { Pages } from "../../src/collections/Pages";

const time = "2026-09-13T12:00:00.000Z";
const fixture = () => {
  const content = mapAIPageDraftContent({
    version: "1.0",
    kind: "pages.createDraft.v1",
    title: "Компания",
    slug: "about",
    sections: [{ heading: "О нас", body: "Исходный абзац." }],
  });
  let page: AIDocument = {
    ...content,
    layout: [
      { ...content.layout[0], id: "content", blockName: null },
      { id: "form", blockType: "formBlock", form: 31 },
      { id: "media", blockType: "mediaBlock", media: 42 },
    ],
    id: 7,
    title: "Компания",
    slug: "about",
    _status: "published",
    publishedOn: time,
    createdAt: time,
    updatedAt: time,
  };
  const base = structuredClone(page);
  let version: AIDocument = {
    id: 11,
    parent: 7,
    latest: true,
    updatedAt: time,
    version: structuredClone(page),
  };
  let publication: AIDocument | null = structuredClone(version);
  let nextID = 12;
  const adapter = {
    ...pageStructureAdapter,
    patch: vi.fn(pageStructureAdapter.patch),
    previewContent: vi.fn(pageStructureAdapter.previewContent),
  };
  const text = {
    ...pageDraftTextAdapter,
    readFields: vi.fn(pageDraftTextAdapter.readFields),
  };
  const knowledge = {
    ...pageKnowledgeAdapter,
    definitions: vi.fn(pageKnowledgeAdapter.definitions),
  };
  const execute = vi.fn(async () => {});
  const api = {
    config: {
      routes: { admin: "/admin" },
      custom: {
        [REALIZE_AI_SERVER_RUNTIME_KEY]: {
          pageDraft: {
            version: "1.0",
            mapContent: mapAIPageDraftContent,
            text,
            knowledge,
            structure: adapter,
          },
        },
      },
    },
    collections: {
      pages: {
        config: {
          fields: Pages.fields,
          access: { update: vi.fn(async () => true) },
        },
      },
      forms: {},
    },
    db: { name: "postgres", sessions: { tx: { db: { execute } } } },
    findByID: vi.fn(async () => ({ id: 31 })),
    find: vi.fn(async (args: Record<string, unknown>) => ({
      docs: [structuredClone(args.draft ? page : base)],
    })),
    findVersions: vi.fn(async (args: Record<string, unknown>) => ({
      docs: JSON.stringify(args.where).includes('"latest"')
        ? [structuredClone(version)]
        : publication
          ? [structuredClone(publication)]
          : [],
    })),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => {
      page = {
        ...page,
        ...structuredClone(args.data),
        updatedAt: `2026-09-13T12:00:${String(nextID).padStart(2, "0")}.000Z`,
      };
      version = {
        id: nextID++,
        parent: 7,
        latest: true,
        updatedAt: page.updatedAt,
        version: structuredClone(page),
      };
      return page;
    }),
  };
  const payload = api as unknown as Payload;
  const req = {
    payload,
    transactionID: "tx",
    user: { id: 1 },
  } as PayloadRequest;
  const service = new PageDraftStructure(payload, req);
  const reader = new PageDraftUpdate(payload, req);
  const prepare = async (action: "insert" | "move" | "remove" = "insert") => {
    const context = await reader.readStructure("7");
    const operation: UpdatePageStructureDraftIntent["operation"] =
      action === "insert"
        ? {
            type: "insert",
            beforeBlockID: "form",
            section: { heading: "Доставка", body: "Заказ привезём завтра." },
          }
        : action === "move"
          ? { type: "move", blockID: "content", beforeBlockID: null }
          : { type: "remove", blockID: "content" };
    const intent: UpdatePageStructureDraftIntent = {
      version: "1.0",
      kind: "pages.updateStructureDraft.v1",
      pageID: "7",
      expectedUpdatedAt: context.updatedAt,
      expectedFingerprint: context.fingerprint,
      expectedCatalogHash: context.knowledge.catalogHash,
      operation,
    };
    const snapshot = await service.dryRun(intent);
    return {
      id: 1,
      kind: intent.kind,
      intent,
      afterSnapshot: snapshot,
      beforeSnapshot: snapshot.beforePage,
      operationHash: service.operationHash(intent, snapshot),
    } as AIDocument;
  };
  return {
    api,
    req,
    service,
    reader,
    prepare,
    adapter,
    text,
    knowledge,
    page: () => page,
    base: () => base,
    setPage: (next: AIDocument) => {
      page = next;
    },
    changeVersion: () => {
      version.id = 99;
    },
    publish: () => {
      publication = { id: 90, updatedAt: time, version: structuredClone(page) };
    },
  };
};

describe("Data Lane структуры Content", () => {
  it("применяет первый блок к пустому draft и откатывает к исходному пустому layout", async () => {
    const f = fixture();
    f.setPage({ ...f.page(), _status: "draft", layout: [] });
    const context = await f.reader.readStructure("7");
    const intent: UpdatePageStructureDraftIntent = {
      version: "1.0",
      kind: "pages.updateStructureDraft.v1",
      pageID: "7",
      expectedUpdatedAt: context.updatedAt,
      expectedFingerprint: context.fingerprint,
      expectedCatalogHash: context.knowledge.catalogHash,
      operation: {
        type: "insert",
        beforeBlockID: null,
        section: { body: "Первый блок." },
      },
    };
    const snapshot = await f.service.dryRun(intent);
    const operation = {
      id: 1,
      kind: intent.kind,
      intent,
      beforeSnapshot: snapshot.beforePage,
      afterSnapshot: snapshot,
      operationHash: f.service.operationHash(intent, snapshot),
    };
    expect(snapshot.preview.totalBefore).toBe(0);
    expect(snapshot.preview.totalAfter).toBe(1);
    const applied = await f.service.apply(operation);
    expect(f.page().layout).toHaveLength(1);
    await f.service.rollback({ ...operation, ...applied });
    expect(f.page().layout).toEqual([]);
    expect(f.page()._status).toBe("draft");
  });

  it.each(["insert", "move", "remove"] as const)(
    "готовит повторяемый %s без записи, применяет в draft и точно восстанавливает layout",
    async (action) => {
      const f = fixture();
      const original = structuredClone(f.page());
      const base = structuredClone(f.base());
      const operation = await f.prepare(action);
      const repeated = await f.service.dryRun(
        operation.intent as UpdatePageStructureDraftIntent,
      );
      expect(hashCanonicalJSON(repeated)).toBe(
        hashCanonicalJSON(operation.afterSnapshot),
      );
      expect(f.api.update).not.toHaveBeenCalled();
      expect(f.text.readFields).not.toHaveBeenCalled();
      const applied = await f.service.apply(operation);
      expect(f.page().layout).not.toEqual(original.layout);
      expect(f.page().hero).toEqual(original.hero);
      expect(f.page()._status).toBe("draft");
      expect(f.base()).toEqual(base);
      expect(applied.appliedSnapshot.catalogHash).toHaveLength(64);
      await f.service.rollback({ ...operation, ...applied });
      expect(f.page().layout).toEqual(original.layout);
      expect(f.base()).toEqual(base);
      expect(
        f.api.update.mock.calls.every(
          ([args]) =>
            (args as Record<string, unknown>).overrideAccess === false &&
            (args as Record<string, unknown>).overrideLock === false,
        ),
      ).toBe(true);
    },
  );

  it.each([
    "timestamp",
    "fingerprint",
    "catalog",
    "version",
    "publication",
    "adapter",
    "snapshot",
  ])("отклоняет устаревший apply: %s", async (reason) => {
    const f = fixture();
    const operation = await f.prepare();
    const intent = operation.intent as UpdatePageStructureDraftIntent;
    if (reason === "timestamp")
      intent.expectedUpdatedAt = "2026-09-13T11:00:00.000Z";
    if (reason === "fingerprint") intent.expectedFingerprint = "0".repeat(64);
    if (reason === "catalog") intent.expectedCatalogHash = "0".repeat(64);
    if (reason === "version") f.changeVersion();
    if (reason === "publication") f.publish();
    if (reason === "adapter") f.adapter.version = "2.0";
    if (reason === "snapshot")
      (
        operation.afterSnapshot as { writeData: Record<string, unknown> }
      ).writeData.title = "Подмена";
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.api.update).not.toHaveBeenCalled();
  });

  it.each([
    "autosave",
    "version",
    "publication",
    "catalog",
    "adapter",
    "snapshot",
  ])("отклоняет rollback после изменения: %s", async (reason) => {
    const f = fixture();
    const operation = await f.prepare();
    const applied = await f.service.apply(operation);
    if (reason === "autosave")
      f.setPage({ ...f.page(), title: "Изменено редактором" });
    if (reason === "version") f.changeVersion();
    if (reason === "publication") f.publish();
    if (reason === "catalog")
      f.knowledge.definitions.mockImplementation((fields) => {
        const definitions = pageKnowledgeAdapter.definitions(fields);
        definitions[0].description += " Изменение.";
        return definitions;
      });
    if (reason === "adapter") f.adapter.version = "2.0";
    if (reason === "snapshot")
      applied.appliedSnapshot.catalogHash = "0".repeat(64);
    await expect(
      f.service.rollback({ ...operation, ...applied }),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.api.update).toHaveBeenCalledTimes(1);
  });

  it("повторно проверяет ACL и штатную блокировку редактора", async () => {
    const f = fixture();
    const operation = await f.prepare();
    f.api.collections.pages.config.access.update.mockResolvedValueOnce(false);
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.api.update).not.toHaveBeenCalled();
    f.api.update.mockRejectedValueOnce(new Locked("fixture lock"));
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("не принимает неожиданный эффект Payload hook", async () => {
    const f = fixture();
    const operation = await f.prepare();
    const update = f.api.update.getMockImplementation()!;
    f.api.update.mockImplementationOnce(async (args) => {
      await update(args);
      f.setPage({ ...f.page(), slug: "modified-by-hook" });
      return f.page();
    });
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("ограничивает private page snapshot независимо от текстового контекста", async () => {
    const f = fixture();
    f.setPage({ ...f.page(), ignoredHostMetadata: "x".repeat(1024 * 1024) });
    await expect(f.prepare()).rejects.toMatchObject({ status: 400 });
    expect(f.api.update).not.toHaveBeenCalled();
  });
});
