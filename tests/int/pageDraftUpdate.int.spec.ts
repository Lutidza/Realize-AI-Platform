// @vitest-environment node
/**
 * @file tests/int/pageDraftUpdate.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Проверяет точный diff, версии, сохранность связей и защищённый откат текста Pages.
 */
import type {
  PageDraftTextChange,
  UpdatePageDraftIntent,
} from "@realize/ai-contracts";
import {
  createPageDraftUpdateRollbackHash,
  hashCanonicalJSON,
} from "@realize/change-engine";
import { Locked, Forbidden, type Payload, type PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../packages/payload-ai-plugin/src/constants";
import { toDataOperationDTO } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationMapper";
import { PageDraftUpdate } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { mapAIPageDraftContent } from "../../src/collections/Pages/mapAIPageDraft.mapper";
import { pageDraftTextAdapter } from "../../src/collections/Pages/pageDraftText.adapter";
import { pageKnowledgeAdapter } from "../../src/collections/Pages/pageKnowledge.adapter";
import { Pages } from "../../src/collections/Pages";

const time = "2026-09-12T12:00:00.000Z";
const textPath = "/layout/0/columns/0/richText/root/children/0/children/0/text";
const fixture = (isPublished = true, withKnowledge = false) => {
  const content = mapAIPageDraftContent({
    version: "1.0",
    kind: "pages.createDraft.v1",
    title: "Компания",
    slug: "about",
    sections: [{ body: "Исходный абзац." }],
  });
  let page: AIDocument = {
    ...content,
    hero: { ...content.hero, media: 19 },
    layout: [
      ...content.layout,
      { id: "media-block", blockType: "mediaBlock", media: 21 },
      { id: "form-block", blockType: "formBlock", form: 31 },
    ],
    meta: { title: null, description: null, image: 17 },
    id: 7,
    title: "Компания",
    slug: "about",
    _status: isPublished ? "published" : "draft",
    publishedOn: isPublished ? time : null,
    createdAt: time,
    updatedAt: time,
  };
  let base = structuredClone(page);
  let version: AIDocument = {
    id: 11,
    parent: 7,
    latest: true,
    updatedAt: time,
    version: structuredClone(page),
  };
  let publication: AIDocument | null = isPublished
    ? structuredClone(version)
    : null;
  let nextID = 12;
  const adapter = {
    version: "1.0",
    readFields: vi.fn(pageDraftTextAdapter.readFields),
    patch: vi.fn(pageDraftTextAdapter.patch),
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
            text: adapter,
            ...(withKnowledge ? { knowledge: pageKnowledgeAdapter } : {}),
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
        updatedAt: `2026-09-12T12:00:${String(nextID).padStart(2, "0")}.000Z`,
      };
      if (publication) publication.latest = false;
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
  const service = new PageDraftUpdate(payload, req);
  const prepare = async (
    changes: PageDraftTextChange[] = [
      { path: textPath, before: "Исходный абзац.", after: "Короткий абзац." },
    ],
  ) => {
    const context = await service.readContext("7");
    const intent: UpdatePageDraftIntent = {
      kind: "pages.updateDraft.v1",
      version: "1.0",
      pageID: "7",
      expectedFingerprint: context.fingerprint,
      expectedUpdatedAt: context.updatedAt,
      changes,
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
    adapter,
    execute,
    req,
    service,
    prepare,
    page: () => page,
    base: () => base,
    setPage: (value: AIDocument) => {
      page = value;
    },
    changeVersion: () => {
      version.id = 99;
    },
    publish: () => {
      base = structuredClone(page);
      publication = { id: 90, updatedAt: time, version: structuredClone(page) };
    },
    prunePublication: () => {
      publication = null;
    },
    replacePublication: () => {
      publication = { id: 91, updatedAt: time, version: structuredClone(page) };
    },
  };
};

describe("Редактирование черновика страницы", () => {
  it("читает ограниченный текст и immutable diff без записи или выдачи Payload структуры", async () => {
    const f = fixture();
    const context = await f.service.readContext("7");
    expect(context).toMatchObject({
      page: { id: "7", slug: "about" },
      adapterVersion: "1.0",
    });
    expect(JSON.stringify(context)).not.toMatch(
      /media-block|form-block|publishedOn|blockType/,
    );
    const operation = await f.prepare();
    const dto = toDataOperationDTO({ operation });
    expect(dto).toMatchObject({
      kind: "pages.updateDraft.v1",
      preview: {
        status: "draft",
        changes: [
          {
            path: textPath,
            before: "Исходный абзац.",
            after: "Короткий абзац.",
          },
        ],
      },
    });
    expect(JSON.stringify(dto)).not.toMatch(
      /beforePage|writeData|expectedPage|baseFingerprint|media-block/,
    );
    expect(f.api.update).not.toHaveBeenCalled();
    expect(
      f.api.find.mock.calls.every(
        ([args]) => args.overrideAccess === false && args.req === f.req,
      ),
    ).toBe(true);
    expect(f.execute).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext('realize:pages:draft-writes'))",
    );
  });

  it.each([
    [new Locked("fixture editor lock"), 409],
    [new Forbidden(), 403],
  ] as const)(
    "возвращает понятный отказ Payload до записи: %s",
    async (error, status) => {
      const f = fixture();
      const before = structuredClone(f.page());
      const operation = await f.prepare();
      f.api.update.mockRejectedValueOnce(error);
      await expect(f.service.apply(operation)).rejects.toMatchObject({
        status,
      });
      expect(f.page()).toEqual(before);
    },
  );
  it.each([
    [true, false],
    [false, false],
    [true, true],
  ])(
    "меняет только утверждённый текст, сохраняя публикацию %s и структуру при knowledge=%s",
    async (published, withKnowledge) => {
      const f = fixture(published, withKnowledge);
      const originalPage = structuredClone(f.page());
      const originalBase = structuredClone(f.base());
      if (withKnowledge) {
        const context = await f.service.readContext("7");
        expect(context.knowledge?.outline.blocks[2]).toMatchObject({
          id: "form-block",
          definitionID: "blocks.formBlock",
        });
      }
      const operation = await f.prepare();
      expect(operation.afterSnapshot).not.toHaveProperty("context.knowledge");
      const applied = await f.service.apply(operation);
      expect(f.base()).toEqual(originalBase);
      expect(f.page().hero).toEqual(originalPage.hero);
      expect(f.page().meta).toEqual(originalPage.meta);
      expect(f.page().slug).toBe(originalPage.slug);
      expect((f.page().layout as unknown[]).slice(1)).toEqual(
        (originalPage.layout as unknown[]).slice(1),
      );
      expect(f.page()._status).toBe("draft");
      expect(f.api.update).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: true,
          overrideAccess: false,
          overrideLock: false,
          req: f.req,
        }),
      );
      expect(applied.appliedSnapshot.adminUrl).toBe(
        "/admin/collections/pages/7",
      );
      const dto = toDataOperationDTO({
        operation: { ...operation, ...applied, state: "applied" },
      });
      expect(dto).toMatchObject({ result: { page: { id: "7" } } });
      await f.service.rollback({ ...operation, ...applied });
      expect(f.page().layout).toEqual(originalPage.layout);
      expect(f.base()).toEqual(originalBase);
    },
  );

  it.each([
    "fingerprint",
    "timestamp",
    "text",
    "version",
    "publication",
    "adapter",
  ])("отклоняет устаревшее изменение: %s", async (reason) => {
    const f = fixture();
    const operation = await f.prepare();
    const intent = operation.intent as UpdatePageDraftIntent;
    if (reason === "fingerprint") intent.expectedFingerprint = "0".repeat(64);
    if (reason === "timestamp")
      intent.expectedUpdatedAt = "2026-09-12T11:00:00.000Z";
    if (reason === "text") f.setPage({ ...f.page(), title: "Другой текст" });
    if (reason === "version") f.changeVersion();
    if (reason === "publication") f.publish();
    if (reason === "adapter") f.adapter.version = "2.0";
    await expect(f.service.apply(operation)).rejects.toThrow();
    expect(f.api.update).not.toHaveBeenCalled();
  });

  it.each([
    "wrong-before",
    "unsupported-path",
    "tampered-snapshot",
    "unrelated-host-change",
    "host-status",
    "missing-host-change",
    "hidden-structural-change",
  ])("не позволяет расширить diff: %s", async (reason) => {
    const f = fixture();
    const operation = await f.prepare();
    const intent = operation.intent as UpdatePageDraftIntent;
    if (reason === "wrong-before")
      intent.changes[0].before = "Выдуманный текст";
    if (reason === "unsupported-path")
      intent.changes[0].path =
        "/layout/1/columns/0/richText/root/children/0/children/0/text";
    if (reason === "tampered-snapshot")
      (
        operation.afterSnapshot as { writeData: Record<string, unknown> }
      ).writeData.title = "Подмена";
    if (reason === "unrelated-host-change")
      f.adapter.patch.mockImplementation((page, changes) => ({
        ...pageDraftTextAdapter.patch(page, changes),
        hero: { type: "none" },
      }));
    if (reason === "host-status")
      f.adapter.patch.mockImplementation((page, changes) => ({
        ...pageDraftTextAdapter.patch(page, changes),
        _status: "published",
      }));
    if (reason === "missing-host-change") f.adapter.patch.mockReturnValue({});
    if (reason === "hidden-structural-change")
      f.adapter.patch.mockImplementation((page, changes) => {
        const patch = pageDraftTextAdapter.patch(page, changes);
        (patch.layout as Array<Record<string, unknown>>)[1].media = 900;
        return patch;
      });
    await expect(f.service.apply(operation)).rejects.toThrow();
    expect(f.api.update).not.toHaveBeenCalled();
  });

  it("повторно проверяет access до apply и сохраняет отказ editor lock", async () => {
    const f = fixture();
    const operation = await f.prepare();
    f.api.collections.pages.config.access.update.mockResolvedValueOnce(false);
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.api.update).not.toHaveBeenCalled();
    f.api.update.mockRejectedValueOnce(new Error("Document is locked"));
    await expect(f.service.apply(operation)).rejects.toThrow(
      "Document is locked",
    );
  });

  it.each([
    "autosave",
    "version",
    "publication",
    "snapshot",
    "adapter",
    "projection",
    "incomplete",
  ])("отклоняет rollback после изменения: %s", async (reason) => {
    const f = fixture();
    const operation = await f.prepare();
    const applied = await f.service.apply(operation);
    if (reason === "autosave")
      f.setPage({ ...f.page(), title: "Изменено редактором" });
    if (reason === "version") f.changeVersion();
    if (reason === "publication") f.publish();
    if (reason === "snapshot")
      applied.appliedSnapshot.fingerprint = "0".repeat(64);
    if (reason === "adapter") f.adapter.version = "2.0";
    if (reason === "projection")
      f.adapter.readFields.mockImplementation((page) =>
        pageDraftTextAdapter
          .readFields(page)
          .filter((field) => field.path !== textPath),
      );
    if (reason === "incomplete") applied.appliedSnapshot.adapterVersion = "";
    await expect(
      f.service.rollback({ ...operation, ...applied }),
    ).rejects.toThrow();
    expect(f.api.update).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined, ""])(
    "восстанавливает пустое optional SEO значение и сохраняет image: %s",
    async (value) => {
      const f = fixture(false);
      f.setPage({
        ...f.page(),
        meta: {
          image: 17,
          ...(value === undefined ? {} : { description: value }),
        },
      });
      const operation = await f.prepare([
        { path: "/meta/description", before: "", after: "Описание" },
      ]);
      const applied = await f.service.apply(operation);
      await f.service.rollback({ ...operation, ...applied });
      expect(f.page().meta).toEqual({
        image: 17,
        description: value === undefined ? null : value,
      });
    },
  );

  it("возвращает исходный literal HTML как текст без повторного разрешения нового HTML", async () => {
    const f = fixture();
    f.setPage({ ...f.page(), title: "Пример <b>текста</b>" });
    const operation = await f.prepare([
      {
        path: "/title",
        before: "Пример <b>текста</b>",
        after: "Пример текста",
      },
    ]);
    const applied = await f.service.apply(operation);
    await f.service.rollback({ ...operation, ...applied });
    expect(f.page().title).toBe("Пример <b>текста</b>");
  });

  it("проверяет фактический результат hooks и неизменность публичной базы", async () => {
    const f = fixture();
    const operation = await f.prepare();
    const original = f.api.update.getMockImplementation()!;
    f.api.update.mockImplementationOnce(async (args) => {
      await original(args);
      f.setPage({ ...f.page(), slug: "unexpected-slug" });
      return f.page();
    });
    await expect(f.service.apply(operation)).rejects.toThrow(
      "точное содержимое",
    );
  });

  it("не принимает неполный rollback binding и не смешивает его с другими операциями", () => {
    const hash = createPageDraftUpdateRollbackHash({
      operationHash: "a".repeat(64),
    });
    expect(hash).not.toBe(hashCanonicalJSON({ operationHash: "a".repeat(64) }));
    expect(() =>
      createPageDraftUpdateRollbackHash({
        operationHash: "a".repeat(64),
        pageID: "7",
      } as Parameters<typeof createPageDraftUpdateRollbackHash>[0]),
    ).toThrow("complete applied snapshot");
  });

  it("разрешает собственную очистку старой published version по maxPerDoc и точный rollback", async () => {
    const f = fixture();
    const originalBase = structuredClone(f.base());
    const originalPage = structuredClone(f.page());
    const operation = await f.prepare();
    const original = f.api.update.getMockImplementation()!;
    f.api.update.mockImplementationOnce(async (args) => {
      const page = await original(args);
      f.prunePublication();
      return page;
    });
    const applied = await f.service.apply(operation);
    await f.service.rollback({ ...operation, ...applied });
    expect(f.base()).toEqual(originalBase);
    expect(f.page().layout).toEqual(originalPage.layout);
  });

  it("не допускает новую publication history даже при неизменной основной строке", async () => {
    const f = fixture();
    const operation = await f.prepare();
    const original = f.api.update.getMockImplementation()!;
    f.api.update.mockImplementationOnce(async (args) => {
      const page = await original(args);
      f.replacePublication();
      return page;
    });
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("возвращает понятную ошибку неподдерживаемого host контекста без записи", async () => {
    const f = fixture();
    f.adapter.readFields.mockImplementationOnce(() => {
      throw new Error("Структура текста слишком велика.");
    });
    await expect(f.service.readContext("7")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_REQUEST",
    });
    expect(f.api.update).not.toHaveBeenCalled();
  });
});
