/**
 * @file packages/payload-ai-plugin/src/endpoints/pageDraftCreation.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет, создаёт и откатывает только неизменённые черновики Pages через Payload.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  parseCreatePageDraftIntent,
  type CreatePageDraftIntent,
} from "@realize/ai-contracts";
import {
  createPageDraftOperationHash,
  createPageDraftRollbackHash,
  hashCanonicalJSON,
} from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../constants";
import type { RealizeAIServerRuntime } from "../types";
import { EndpointError } from "./http";
import { lockAITransaction } from "./lockAITransaction.util";
import type {
  AppliedPageDraftSnapshot,
  PageDraftSnapshot,
  PageLocalAPI,
} from "./PageDraft.types";
import type { AIDocument } from "./repository";

/** Сравнивает заданные поля, сохраняя допустимые server defaults в фактическом документе. */
const containsExpected = (actual: unknown, expected: unknown): boolean => {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => containsExpected(actual[index], value))
    );
  if (expected && typeof expected === "object")
    return Boolean(
      actual &&
      typeof actual === "object" &&
      Object.entries(expected).every(([key, value]) =>
        containsExpected((actual as Record<string, unknown>)[key], value),
      ),
    );
  return actual === expected;
};

/** Mapper доступен только из server config; модель не получает произвольный Local API. */
export class PageDraftCreation {
  private readonly api: PageLocalAPI;
  constructor(
    private readonly payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as PageLocalAPI;
  }

  async dryRun(rawIntent: CreatePageDraftIntent): Promise<PageDraftSnapshot> {
    const intent = parseCreatePageDraftIntent(rawIntent);
    const snapshot = this.snapshot(intent);
    const allowed =
      await this.payload.collections.pages?.config.access.create?.({
        req: this.req,
        data: snapshot.createData,
      });
    if (allowed !== true)
      throw new EndpointError(
        "FORBIDDEN",
        "Недостаточно прав для создания страницы.",
        403,
      );
    await this.assertAvailableSlug(intent.slug);
    return snapshot;
  }

  operationHash(
    intent: CreatePageDraftIntent,
    snapshot: PageDraftSnapshot,
  ): string {
    return createPageDraftOperationHash({
      intent,
      createDataHash: hashCanonicalJSON(snapshot.createData),
      mapperVersion: snapshot.mapperVersion,
    });
  }

  async apply(operation: AIDocument): Promise<{
    appliedSnapshot: AppliedPageDraftSnapshot;
    rollbackHash: string;
  }> {
    await lockAITransaction(this.req, "page-drafts");
    const intent = parseCreatePageDraftIntent(operation.intent);
    const snapshot = await this.dryRun(intent);
    if (
      this.operationHash(intent, snapshot) !== operation.operationHash ||
      hashCanonicalJSON(snapshot) !== hashCanonicalJSON(operation.afterSnapshot)
    )
      throw new EndpointError(
        "CONFLICT",
        "Содержимое или схема страницы изменились после подготовки. Подготовьте новый план.",
        409,
      );
    const created = await this.api.create({
      collection: "pages",
      data: snapshot.createData,
      depth: 0,
      draft: true,
      overrideAccess: false,
      req: this.req,
    });
    const page = await this.readDraft(String(created.id));
    if (
      !containsExpected(page, snapshot.createData) ||
      page._status !== "draft" ||
      page.publishedOn
    )
      throw new EndpointError(
        "CONFLICT",
        "Payload не подтвердил точное содержимое неопубликованного черновика.",
        409,
      );
    const updatedAt = String(page.updatedAt || "");
    if (!Number.isFinite(Date.parse(updatedAt)))
      throw new EndpointError(
        "CONFLICT",
        "У черновика отсутствует версия для безопасного отката.",
        409,
      );
    const appliedSnapshot: AppliedPageDraftSnapshot = {
      pageID: String(page.id),
      title: intent.title,
      slug: intent.slug,
      adminUrl: `${this.payload.config.routes.admin}/collections/pages/${encodeURIComponent(String(page.id))}`,
      updatedAt,
      fingerprint: hashCanonicalJSON(page),
    };
    return {
      appliedSnapshot,
      rollbackHash: createPageDraftRollbackHash({
        operationHash: String(operation.operationHash),
        pageID: appliedSnapshot.pageID,
        updatedAt,
        fingerprint: appliedSnapshot.fingerprint,
      }),
    };
  }

  async rollback(operation: AIDocument): Promise<string> {
    // Отключённый адаптер снимает общий Pages hook, поэтому такой откат небезопасен.
    const runtime = this.payload.config.custom?.[
      REALIZE_AI_SERVER_RUNTIME_KEY
    ] as RealizeAIServerRuntime | undefined;
    if (!runtime?.pageDraft)
      throw new EndpointError(
        "CONFLICT",
        "Адаптер страниц отключён; безопасный откат недоступен.",
        409,
      );
    await lockAITransaction(this.req, "page-drafts");
    const snapshot = operation.appliedSnapshot as
      AppliedPageDraftSnapshot | undefined;
    if (
      !snapshot?.pageID ||
      !snapshot.updatedAt ||
      !snapshot.fingerprint ||
      createPageDraftRollbackHash({
        operationHash: String(operation.operationHash),
        pageID: snapshot.pageID,
        updatedAt: snapshot.updatedAt,
        fingerprint: snapshot.fingerprint,
      }) !== operation.rollbackHash
    )
      throw new EndpointError(
        "CONFLICT",
        "У операции отсутствует проверяемый снимок созданного черновика.",
        409,
      );
    const page = await this.readDraft(snapshot.pageID);
    const published = await this.api.findVersions({
      collection: "pages",
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: false,
      req: this.req,
      where: {
        and: [
          { parent: { equals: snapshot.pageID } },
          { "version._status": { equals: "published" } },
        ],
      },
    });
    if (
      page._status !== "draft" ||
      page.publishedOn ||
      published.docs.length ||
      page.updatedAt !== snapshot.updatedAt ||
      hashCanonicalJSON(page) !== snapshot.fingerprint
    )
      throw new EndpointError(
        "CONFLICT",
        "Страница изменена или публиковалась после создания. Автоматический откат запрещён.",
        409,
      );
    await this.api.delete({
      collection: "pages",
      id: snapshot.pageID,
      overrideAccess: false,
      req: this.req,
    });
    return snapshot.updatedAt;
  }

  private snapshot(intent: CreatePageDraftIntent): PageDraftSnapshot {
    const runtime = this.payload.config.custom?.[
      REALIZE_AI_SERVER_RUNTIME_KEY
    ] as RealizeAIServerRuntime | undefined;
    const adapter = runtime?.pageDraft;
    if (
      !adapter ||
      !adapter.version ||
      typeof adapter.mapContent !== "function"
    )
      throw new EndpointError(
        "CONFLICT",
        "Создание страниц не подключено к схеме этого проекта.",
        409,
      );
    let content: ReturnType<typeof adapter.mapContent>;
    try {
      content = adapter.mapContent(intent);
    } catch (error) {
      throw new EndpointError(
        "INVALID_REQUEST",
        error instanceof Error
          ? error.message
          : "Содержимое страницы недопустимо.",
        400,
      );
    }
    const preview = {
      title: intent.title,
      slug: intent.slug,
      sections: intent.sections,
      ...(intent.description ? { description: intent.description } : {}),
      status: "draft" as const,
    };
    return {
      mapperVersion: adapter.version,
      preview,
      createData: {
        title: intent.title,
        slug: intent.slug,
        _status: "draft",
        hero: content.hero,
        layout: content.layout,
        ...(content.meta
          ? {
              meta: {
                ...(content.meta.title ? { title: content.meta.title } : {}),
                ...(content.meta.description
                  ? { description: content.meta.description }
                  : {}),
              },
            }
          : {}),
      },
    };
  }

  private async assertAvailableSlug(slug: string): Promise<void> {
    const existing = await this.api.find({
      collection: "pages",
      depth: 0,
      draft: true,
      limit: 1,
      pagination: false,
      overrideAccess: false,
      req: this.req,
      where: { slug: { equals: slug } },
    });
    if (existing.docs.length)
      throw new EndpointError(
        "CONFLICT",
        "Страница с таким адресом уже существует. Выберите другой slug.",
        409,
      );
  }

  private async readDraft(id: string): Promise<AIDocument> {
    const result = await this.api.find({
      collection: "pages",
      depth: 0,
      draft: true,
      limit: 1,
      pagination: false,
      overrideAccess: false,
      req: this.req,
      where: { id: { equals: id } },
    });
    if (result.docs.length !== 1)
      throw new EndpointError(
        "CONFLICT",
        "Созданный черновик удалён или недоступен.",
        409,
      );
    return result.docs[0];
  }
}
