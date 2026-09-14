/**
 * @file packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service.ts
 * @version 1.1.1
 * @date 2026-09-13
 * @description Готовит, применяет и откатывает точные текстовые изменения одной версии черновика.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  parsePageDraftContext,
  parsePageStructureContext,
  parseUpdatePageDraftIntent,
  type PageDraftContextDTO,
  type PageStructureContextDTO,
  type UpdatePageDraftIntent,
} from "@realize/ai-contracts";
import {
  createPageDraftUpdateOperationHash,
  createPageDraftUpdateRollbackHash,
  hashCanonicalJSON,
} from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../constants";
import type { RealizeAIServerRuntime } from "../types";
import { createPageDraftRestorePatch } from "./createPageDraftRestorePatch.mapper";
import { EndpointError } from "./http";
import { PageDraftRevisionGuard } from "./PageDraftRevisionGuard.service";
import { PageDraftUpdateRepository } from "./PageDraftUpdate.repository";
import type {
  AppliedPageDraftUpdateSnapshot,
  PageDraftRevision,
  PageDraftTextAdapter,
  PageDraftUpdateSnapshot,
} from "./PageDraftUpdate.types";
import type { AIDocument } from "./repository";
import { validatePageDraftTextPatch } from "./validatePageDraftTextPatch.validator";
import { PageKnowledge } from "./pageKnowledge.service";
import type { PageStructureReadRequest } from "./PageKnowledge.types";

/** Все чтения одного снимка и записи сериализованы с обычным редактором Pages. */
export class PageDraftUpdate extends PageDraftRevisionGuard {
  private readonly repository: PageDraftUpdateRepository;
  constructor(payload: Payload, req: PayloadRequest) {
    super(payload, req);
    this.repository = new PageDraftUpdateRepository(payload, req);
  }

  async readContext(pageID: string): Promise<PageDraftContextDTO> {
    return await this.locked(async () => {
      await this.assertAccess(pageID);
      const revision = await this.repository.read(pageID);
      const context = this.context(revision, this.adapter());
      const runtime = this.payload.config.custom?.[
        REALIZE_AI_SERVER_RUNTIME_KEY
      ] as RealizeAIServerRuntime | undefined;
      // Enrichment не входит в snapshot записи: прежние operation hashes остаются неизменными.
      if (!runtime?.pageDraft?.knowledge) return context;
      const knowledge = await new PageKnowledge(this.req).read(
        revision.page,
        context.fingerprint,
        0,
      );
      return parsePageDraftContext({ ...context, knowledge });
    });
  }

  /** Независимое чтение структуры не извлекает все текстовые листья большой страницы. */
  async readStructure(
    pageID: string,
    request: PageStructureReadRequest = {},
  ): Promise<PageStructureContextDTO> {
    const offset = request.offset ?? 0;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 10_000 ||
      offset % 32 !== 0 ||
      (offset > 0 && (!request.fingerprint || !request.catalogHash)) ||
      [request.fingerprint, request.catalogHash].some(
        (value) => value !== undefined && !/^[a-f0-9]{64}$/.test(value),
      )
    )
      throw new EndpointError(
        "INVALID_REQUEST",
        "Продолжение структуры требует корректные offset, fingerprint и catalogHash.",
        400,
      );
    return await this.locked(async () => {
      await this.assertAccess(pageID);
      const revision = await this.repository.read(pageID);
      const identity = this.revisionIdentity(revision, this.adapter());
      if (request.fingerprint && request.fingerprint !== identity.fingerprint)
        throw new EndpointError(
          "CONFLICT",
          "Страница изменилась. Перечитайте структуру с начала.",
          409,
        );
      const knowledge = await new PageKnowledge(this.req).read(
        revision.page,
        identity.fingerprint,
        offset,
      );
      if (request.catalogHash && request.catalogHash !== knowledge.catalogHash)
        throw new EndpointError(
          "CONFLICT",
          "Описание схемы изменилось. Перечитайте структуру с начала.",
          409,
        );
      return parsePageStructureContext({
        page: identity.page,
        updatedAt: identity.updatedAt,
        fingerprint: identity.fingerprint,
        knowledge,
      });
    });
  }

  async dryRun(
    rawIntent: UpdatePageDraftIntent,
  ): Promise<PageDraftUpdateSnapshot> {
    const intent = parseUpdatePageDraftIntent(rawIntent);
    return await this.locked(async () => {
      await this.assertAccess(intent.pageID);
      return this.snapshot(
        intent,
        await this.repository.read(intent.pageID),
        this.adapter(),
      );
    });
  }

  operationHash(
    intent: UpdatePageDraftIntent,
    snapshot: PageDraftUpdateSnapshot,
  ): string {
    return createPageDraftUpdateOperationHash({
      intent,
      snapshotHash: hashCanonicalJSON(snapshot),
    });
  }

  async apply(operation: AIDocument): Promise<{
    appliedSnapshot: AppliedPageDraftUpdateSnapshot;
    rollbackHash: string;
  }> {
    return await this.locked(async () => {
      const intent = parseUpdatePageDraftIntent(operation.intent);
      const snapshot = await this.dryRun(intent);
      if (
        this.operationHash(intent, snapshot) !== operation.operationHash ||
        hashCanonicalJSON(snapshot) !==
          hashCanonicalJSON(operation.afterSnapshot)
      )
        throw new EndpointError(
          "CONFLICT",
          "Содержимое или схема страницы изменились после подготовки. Подготовьте новый план.",
          409,
        );
      await this.assertAccess(intent.pageID, snapshot.writeData);
      await this.repository.update(intent.pageID, snapshot.writeData);
      const revision = await this.repository.read(intent.pageID);
      this.assertSaved(revision, snapshot.expectedPage, snapshot);
      const context = this.context(revision, this.adapter());
      const appliedSnapshot: AppliedPageDraftUpdateSnapshot = {
        pageID: intent.pageID,
        title: context.page.title,
        slug: context.page.slug ?? "",
        adminUrl: `${this.payload.config.routes.admin}/collections/pages/${encodeURIComponent(intent.pageID)}`,
        updatedAt: context.updatedAt,
        fingerprint: context.fingerprint,
        adapterVersion: context.adapterVersion,
      };
      return {
        appliedSnapshot,
        rollbackHash: createPageDraftUpdateRollbackHash({
          operationHash: String(operation.operationHash),
          ...appliedSnapshot,
        }),
      };
    });
  }

  async rollback(operation: AIDocument): Promise<string> {
    return await this.locked(async () => {
      const intent = parseUpdatePageDraftIntent(operation.intent);
      const snapshot = operation.afterSnapshot as PageDraftUpdateSnapshot;
      const applied = operation.appliedSnapshot as
        AppliedPageDraftUpdateSnapshot | undefined;
      if (
        !snapshot ||
        this.operationHash(intent, snapshot) !== operation.operationHash ||
        !applied?.pageID ||
        !applied.updatedAt ||
        !applied.fingerprint ||
        !applied.adapterVersion ||
        applied.pageID !== intent.pageID ||
        createPageDraftUpdateRollbackHash({
          operationHash: String(operation.operationHash),
          ...applied,
        }) !== operation.rollbackHash
      )
        throw new EndpointError(
          "CONFLICT",
          "У операции отсутствует проверяемый снимок для отката черновика.",
          409,
        );
      await this.assertAccess(intent.pageID);
      const adapter = this.adapter();
      const revision = await this.repository.read(intent.pageID);
      const context = this.context(revision, adapter);
      const fields = new Map(
        context.fields.map((field) => [field.path, field]),
      );
      if (
        context.fingerprint !== applied.fingerprint ||
        context.updatedAt !== applied.updatedAt ||
        adapter.version !== applied.adapterVersion ||
        intent.changes.some(
          (change) => fields.get(change.path)?.value !== change.after,
        )
      )
        throw new EndpointError(
          "CONFLICT",
          "Страница изменена или публиковалась после применения. Автоматический откат запрещён.",
          409,
        );
      const changes = intent.changes.map((change) => ({
        path: change.path,
        before: change.after,
        after: change.before,
      }));
      // Исходный текст уже входил в snapshot: допускаем возврат literal HTML-текста,
      // который запрещён как новый пользовательский after, без интерпретации разметки.
      const patch = createPageDraftRestorePatch(
        snapshot.beforePage,
        revision.page,
        changes,
      );
      const expectedPage = validatePageDraftTextPatch(
        revision.page,
        patch,
        changes,
      );
      await this.assertAccess(intent.pageID, patch);
      await this.repository.update(intent.pageID, patch);
      const restored = await this.repository.read(intent.pageID);
      this.assertSaved(restored, expectedPage, revision);
      return String(restored.page.updatedAt);
    });
  }

  private adapter(): PageDraftTextAdapter {
    const runtime = this.payload.config.custom?.[
      REALIZE_AI_SERVER_RUNTIME_KEY
    ] as RealizeAIServerRuntime | undefined;
    const adapter = runtime?.pageDraft?.text;
    if (
      adapter?.version !== "1.0" ||
      typeof adapter.readFields !== "function" ||
      typeof adapter.patch !== "function"
    )
      throw new EndpointError(
        "CONFLICT",
        "Редактирование текста страниц не подключено к схеме этого проекта.",
        409,
      );
    return adapter;
  }

  private context(
    revision: PageDraftRevision,
    adapter: PageDraftTextAdapter,
  ): PageDraftContextDTO {
    return this.hostResult(() =>
      parsePageDraftContext({
        ...this.revisionIdentity(revision, adapter),
        fields: adapter.readFields(structuredClone(revision.page)),
      }),
    );
  }

  private snapshot(
    intent: UpdatePageDraftIntent,
    revision: PageDraftRevision,
    adapter: PageDraftTextAdapter,
  ): PageDraftUpdateSnapshot {
    const context = this.context(revision, adapter);
    if (
      intent.expectedFingerprint !== context.fingerprint ||
      intent.expectedUpdatedAt !== context.updatedAt
    )
      throw new EndpointError(
        "CONFLICT",
        "Версия страницы изменилась. Выберите актуальную страницу и подготовьте новый план.",
        409,
      );
    const fields = new Map(context.fields.map((field) => [field.path, field]));
    const changes = intent.changes.map((change) => {
      const field = fields.get(change.path);
      if (
        !field ||
        field.value !== change.before ||
        change.after.length > field.maxLength
      )
        throw new EndpointError(
          "CONFLICT",
          "Поле или исходный текст не совпадает с прочитанной страницей.",
          409,
        );
      return { ...change, label: field.label };
    });
    const writeData = this.hostResult(() =>
      adapter.patch(structuredClone(revision.page), intent.changes),
    );
    const expectedPage = validatePageDraftTextPatch(
      revision.page,
      writeData,
      intent.changes,
    );
    return {
      context,
      beforePage: revision.page,
      writeData,
      expectedPage,
      baseFingerprint: revision.baseFingerprint,
      publicationFingerprint: revision.publicationFingerprint,
      preview: { page: context.page, changes, status: "draft" },
    };
  }
}
