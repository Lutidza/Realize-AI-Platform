/**
 * @file packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Готовит, применяет и откатывает точные текстовые изменения одной версии черновика.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  ContractValidationError,
  parsePageDraftContext,
  parseUpdatePageDraftIntent,
  type PageDraftContextDTO,
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
import { lockAITransaction } from "./lockAITransaction.util";
import { PageDraftUpdateRepository } from "./PageDraftUpdate.repository";
import type {
  AppliedPageDraftUpdateSnapshot,
  PageDraftRevision,
  PageDraftTextAdapter,
  PageDraftUpdateSnapshot,
} from "./PageDraftUpdate.types";
import { withPayloadTransaction } from "./payloadTransaction";
import type { AIDocument } from "./repository";
import { validatePageDraftTextPatch } from "./validatePageDraftTextPatch.validator";

/** updatedAt меняется при сохранении версии; остальные поля должны остаться точными. */
const contentHash = (page: AIDocument): string =>
  hashCanonicalJSON(
    Object.fromEntries(
      Object.entries(page).filter(([key]) => key !== "updatedAt"),
    ),
  );

/** Все чтения одного снимка и записи сериализованы с обычным редактором Pages. */
export class PageDraftUpdate {
  private readonly repository: PageDraftUpdateRepository;
  constructor(
    private readonly payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.repository = new PageDraftUpdateRepository(payload, req);
  }

  async readContext(pageID: string): Promise<PageDraftContextDTO> {
    return await this.locked(async () => {
      await this.assertAccess(pageID);
      const revision = await this.repository.read(pageID);
      return this.context(revision, this.adapter());
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
    const page = revision.page;
    return this.hostResult(() =>
      parsePageDraftContext({
        page: {
          id: String(page.id),
          title: page.title,
          ...(typeof page.slug === "string" ? { slug: page.slug } : {}),
        },
        updatedAt: page.updatedAt,
        adapterVersion: adapter.version,
        fingerprint: hashCanonicalJSON({
          ...revision,
          adapterVersion: adapter.version,
        }),
        fields: adapter.readFields(structuredClone(page)),
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

  private assertSaved(
    revision: PageDraftRevision,
    expected: AIDocument,
    snapshot: Pick<
      PageDraftRevision,
      "baseFingerprint" | "publicationFingerprint"
    >,
  ): void {
    // Payload maxPerDoc удаляет старые версии, включая последнюю published запись.
    // Под общим lock её исчезновение при собственной записи допустимо; новая
    // публикация и изменение основной строки по-прежнему запрещены.
    const publicationPreserved =
      revision.publicationFingerprint === snapshot.publicationFingerprint ||
      revision.publicationFingerprint === hashCanonicalJSON(null);
    if (
      revision.page._status !== "draft" ||
      revision.baseFingerprint !== snapshot.baseFingerprint ||
      !publicationPreserved ||
      contentHash(revision.page) !== contentHash(expected)
    )
      throw new EndpointError(
        "CONFLICT",
        "Payload изменил опубликованную версию или не подтвердил точное содержимое черновика.",
        409,
      );
  }

  private async assertAccess(
    pageID: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const access = this.payload.collections.pages?.config.access.update;
    const id =
      this.payload.db.defaultIDType === "text" ? pageID : Number(pageID);
    if (typeof id === "number" && (!Number.isSafeInteger(id) || id < 1))
      throw new EndpointError(
        "INVALID_REQUEST",
        "Идентификатор страницы недопустим.",
        400,
      );
    // Generated host ID сейчас number; переносимый plugin сохраняет тип ID runtime-адаптера.
    const args = { req: this.req, id, ...(data ? { data } : {}) } as Parameters<
      NonNullable<typeof access>
    >[0];
    const allowed = await access?.(args);
    if (allowed !== true)
      throw new EndpointError(
        "FORBIDDEN",
        "Недостаточно прав для редактирования страницы.",
        403,
      );
  }

  private hostResult<T>(work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (
        error instanceof ContractValidationError ||
        (error instanceof Error && error.constructor === Error)
      )
        throw new EndpointError(
          "INVALID_REQUEST",
          `Страница не соответствует ограничениям редактирования: ${error.message}`,
          400,
        );
      throw error;
    }
  }

  private async locked<T>(work: () => Promise<T>): Promise<T> {
    return await withPayloadTransaction(this.req, async () => {
      await lockAITransaction(this.req, "page-drafts");
      return await work();
    });
  }
}
