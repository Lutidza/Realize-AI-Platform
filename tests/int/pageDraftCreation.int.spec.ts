// @vitest-environment node
/**
 * @file tests/int/pageDraftCreation.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-14
 * @description Проверяет границы dry-run, создания и отката черновика Pages без изменения рабочих данных.
 */
import type { CreatePageDraftIntent } from "@realize/ai-contracts";
import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../packages/payload-ai-plugin/src/constants";
import { PageDraftCreation } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftCreation.service";
import { toDataOperationDTO } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationMapper";
import { lockPageDraftWrites } from "../../packages/payload-ai-plugin/src/endpoints/lockPageDraftWrites.hook";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { mapAIPageDraftContent } from "../../src/collections/Pages/mapAIPageDraft.mapper";

const intent: CreatePageDraftIntent = {
  kind: "pages.createDraft.v1",
  version: "1.0",
  title: "О компании",
  slug: "about",
  sections: [
    {
      heading: "Наша команда",
      body: "Демонстрационный текст.\nВторая строка.",
    },
  ],
  description: "Демо-страница компании",
};
const fixture = () => {
  let page: AIDocument | undefined;
  let published = false;
  const execute = vi.fn(async () => {});
  const api = {
    config: {
      routes: { admin: "/admin" },
      custom: {
        [REALIZE_AI_SERVER_RUNTIME_KEY]: {
          pageDraft: { version: "1.0", mapContent: mapAIPageDraftContent },
        },
      },
    },
    collections: {
      pages: { config: { access: { create: vi.fn(async () => true) } } },
    },
    db: { name: "postgres", sessions: { tx: { db: { execute } } } },
    find: vi.fn(async () => ({ docs: page ? [page] : [] })),
    findVersions: vi.fn(async () => ({ docs: published ? [{ id: 5 }] : [] })),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      page = {
        ...structuredClone(args.data),
        id: 7,
        createdAt: "2026-09-11T12:00:00.000Z",
        updatedAt: "2026-09-11T12:00:00.000Z",
      };
      return page;
    }),
    delete: vi.fn(async () => {
      const previous = page!;
      page = undefined;
      return previous;
    }),
  };
  const payload = api as unknown as Payload;
  const req = {
    payload,
    transactionID: "tx",
    user: { id: 1 },
  } as PayloadRequest;
  const service = new PageDraftCreation(payload, req);
  const prepare = async () => {
    const snapshot = await service.dryRun(intent);
    return {
      id: 1,
      kind: intent.kind,
      intent,
      afterSnapshot: snapshot,
      operationHash: service.operationHash(intent, snapshot),
    } as AIDocument;
  };
  return {
    api,
    execute,
    req,
    service,
    prepare,
    getPage: () => page!,
    publish: () => {
      published = true;
    },
  };
};

describe("Создание черновика страницы", () => {
  it("dry-run показывает точный текст, но не создаёт запись", async () => {
    const f = fixture();
    const snapshot = await f.service.dryRun(intent);
    expect(snapshot.preview).toMatchObject({
      title: intent.title,
      slug: "about",
      sections: intent.sections,
      status: "draft",
    });
    expect(snapshot.createData).toMatchObject({
      _status: "draft",
      hero: { type: "lowImpact" },
      layout: [{ blockType: "content" }],
    });
    expect(f.api.create).not.toHaveBeenCalled();
  });

  it("отклоняет отсутствие create access и занятый slug до записи", async () => {
    const f = fixture();
    f.api.collections.pages.config.access.create.mockResolvedValueOnce(false);
    await expect(f.service.dryRun(intent)).rejects.toMatchObject({
      status: 403,
    });
    const operation = await f.prepare();
    await f.service.apply(operation);
    await expect(f.service.dryRun(intent)).rejects.toThrow("уже существует");
    expect(f.api.create).toHaveBeenCalledTimes(1);
  });

  it("отклоняет служебные маршруты host и отсутствующий adapter", async () => {
    const f = fixture();
    await expect(
      f.service.dryRun({ ...intent, slug: "checkout" }),
    ).rejects.toThrow("служебным");
    f.api.config.custom = {} as typeof f.api.config.custom;
    await expect(f.service.dryRun(intent)).rejects.toThrow("не подключено");
  });

  it("связывает утверждение с версией mapper и exact server snapshot", async () => {
    const f = fixture();
    const operation = await f.prepare();
    f.api.config.custom[REALIZE_AI_SERVER_RUNTIME_KEY].pageDraft.version =
      "2.0";
    await expect(f.service.apply(operation)).rejects.toThrow(
      "после подготовки",
    );
    expect(f.api.create).not.toHaveBeenCalled();
  });

  it("создаёт draft с caller access и удаляет только его проверенный снимок", async () => {
    const f = fixture();
    const operation = await f.prepare();
    const applied = await f.service.apply(operation);
    expect(f.api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        overrideAccess: false,
        req: f.req,
      }),
    );
    expect(applied.appliedSnapshot.adminUrl).toBe("/admin/collections/pages/7");
    await f.service.rollback({ ...operation, ...applied });
    expect(f.api.delete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "7", overrideAccess: false, req: f.req }),
    );
    expect(f.execute).toHaveBeenCalledTimes(2);
  });

  it.each(["autosave", "published", "snapshot"])(
    "блокирует небезопасный rollback: %s",
    async (reason) => {
      const f = fixture();
      const operation = await f.prepare();
      const applied = await f.service.apply(operation);
      if (reason === "autosave") f.getPage().title = "Изменено редактором";
      if (reason === "published") f.publish();
      if (reason === "snapshot") applied.appliedSnapshot.pageID = "999";
      await expect(
        f.service.rollback({ ...operation, ...applied }),
      ).rejects.toThrow();
      expect(f.api.delete).not.toHaveBeenCalled();
    },
  );

  it("блокирует rollback после отключения адаптера и общего Pages hook", async () => {
    const f = fixture();
    const operation = await f.prepare();
    const applied = await f.service.apply(operation);
    f.api.config.custom = {} as typeof f.api.config.custom;
    await expect(
      f.service.rollback({ ...operation, ...applied }),
    ).rejects.toThrow("Адаптер страниц отключён");
    expect(f.api.delete).not.toHaveBeenCalled();
  });

  it("не отдаёт raw createData/fingerprint в browser DTO", async () => {
    const f = fixture();
    const operation = await f.prepare();
    const applied = await f.service.apply(operation);
    const dto = toDataOperationDTO({
      apiRoute: "/custom-api/",
      operation: { ...operation, ...applied, state: "applied", version: 3 },
    });
    expect(dto).toMatchObject({
      kind: "pages.createDraft.v1",
      result: {
        page: { id: "7", title: intent.title },
        frontendPreviewUrl: `/custom-api/realize-ai/data-operations/${encodeURIComponent(String(operation.id))}/open-page`,
      },
    });
    expect(JSON.stringify(dto)).not.toMatch(
      /createData|fingerprint|blockType|expectedTargetUpdatedAt|previewSecret/,
    );
    expect(applied.appliedSnapshot).not.toHaveProperty("frontendPreviewUrl");
  });

  it("обычный autosave update и управляемый rollback используют общий transaction lock", async () => {
    const f = fixture();
    await lockPageDraftWrites({
      args: {},
      operation: "update",
      req: f.req,
    } as Parameters<typeof lockPageDraftWrites>[0]);
    expect(f.execute).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext('realize:pages:draft-writes'))",
    );
  });
});
