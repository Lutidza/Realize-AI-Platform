/**
 * @file packages/payload-ai-plugin/src/endpoints/pageDraftStructure.service.ts
 * @version 1.0.1
 * @date 2026-09-14
 * @description Готовит, применяет и откатывает одно точное изменение размещения Content в черновике.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  parseUpdatePageStructureDraftIntent,
  parsePageDraftContentPreview,
  parsePageDraftStructurePreview,
  parsePageStructureContext,
  type UpdatePageStructureDraftIntent,
} from "@realize/ai-contracts";
import {
  createPageDraftStructureOperationHash,
  createPageDraftStructureRollbackHash,
  hashCanonicalJSON,
} from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../constants";
import type { RealizeAIServerRuntime } from "../types";
import { EndpointError } from "./http";
import { PageDraftRevisionGuard } from "./PageDraftRevisionGuard.service";
import { PageDraftUpdateRepository } from "./PageDraftUpdate.repository";
import { PageKnowledge } from "./pageKnowledge.service";
import { validatePageDraftStructurePatch } from "./validatePageDraftStructurePatch.validator";
import type { PageDraftRevision } from "./PageDraftUpdate.types";
import type {
  AppliedPageDraftStructureSnapshot,
  PageDraftStructureAdapter,
  PageDraftStructureSnapshot,
} from "./PageDraftStructure.types";
import type { AIDocument } from "./repository";

/** Одно изменение проходит существующий Pages lock, редакторские ACL и revision checks. */
export class PageDraftStructure extends PageDraftRevisionGuard {
  private readonly repository: PageDraftUpdateRepository;
  constructor(payload: Payload, req: PayloadRequest) {
    super(payload, req);
    this.repository = new PageDraftUpdateRepository(payload, req);
  }

  async dryRun(
    rawIntent: UpdatePageStructureDraftIntent,
  ): Promise<PageDraftStructureSnapshot> {
    const intent = parseUpdatePageStructureDraftIntent(rawIntent);
    return await this.locked(async () => {
      await this.assertAccess(intent.pageID);
      return await this.snapshot(
        intent,
        await this.repository.read(intent.pageID),
        this.adapter(),
      );
    });
  }

  operationHash(
    intent: UpdatePageStructureDraftIntent,
    snapshot: PageDraftStructureSnapshot,
  ): string {
    return createPageDraftStructureOperationHash({
      intent,
      snapshotHash: hashCanonicalJSON(snapshot),
    });
  }

  async apply(operation: AIDocument): Promise<{
    appliedSnapshot: AppliedPageDraftStructureSnapshot;
    rollbackHash: string;
  }> {
    return await this.locked(async () => {
      const intent = parseUpdatePageStructureDraftIntent(operation.intent);
      const snapshot = await this.dryRun(intent);
      if (
        this.operationHash(intent, snapshot) !== operation.operationHash ||
        hashCanonicalJSON(snapshot) !==
          hashCanonicalJSON(operation.afterSnapshot)
      )
        throw new EndpointError(
          "CONFLICT",
          "Страница или схема изменилась после подготовки. Подготовьте новый план.",
          409,
        );
      await this.assertAccess(intent.pageID, snapshot.writeData);
      await this.repository.update(intent.pageID, snapshot.writeData);
      const revision = await this.repository.read(intent.pageID);
      this.assertSaved(revision, snapshot.expectedPage, snapshot);
      const identity = this.revisionIdentity(revision, { version: "1.0" });
      const appliedSnapshot: AppliedPageDraftStructureSnapshot = {
        pageID: intent.pageID,
        title: String(identity.page.title),
        slug: identity.page.slug ?? "",
        adminUrl: `${this.payload.config.routes.admin}/collections/pages/${encodeURIComponent(intent.pageID)}`,
        updatedAt: String(identity.updatedAt),
        fingerprint: identity.fingerprint,
        adapterVersion: snapshot.adapterVersion,
        catalogHash: snapshot.context.knowledge.catalogHash,
      };
      return {
        appliedSnapshot,
        rollbackHash: createPageDraftStructureRollbackHash({
          operationHash: String(operation.operationHash),
          ...appliedSnapshot,
        }),
      };
    });
  }

  async rollback(operation: AIDocument): Promise<string> {
    return await this.locked(async () => {
      const intent = parseUpdatePageStructureDraftIntent(operation.intent);
      const snapshot = operation.afterSnapshot as
        PageDraftStructureSnapshot | undefined;
      const applied = operation.appliedSnapshot as
        AppliedPageDraftStructureSnapshot | undefined;
      if (
        !snapshot ||
        this.operationHash(intent, snapshot) !== operation.operationHash ||
        !applied?.pageID ||
        applied.pageID !== intent.pageID ||
        !applied.updatedAt ||
        !applied.fingerprint ||
        !applied.adapterVersion ||
        !applied.catalogHash ||
        createPageDraftStructureRollbackHash({
          operationHash: String(operation.operationHash),
          ...applied,
        }) !== operation.rollbackHash
      )
        throw new EndpointError(
          "CONFLICT",
          "У операции отсутствует проверяемый снимок для отката структуры.",
          409,
        );
      await this.assertAccess(intent.pageID);
      const adapter = this.adapter();
      const revision = await this.repository.read(intent.pageID);
      const identity = this.revisionIdentity(revision, { version: "1.0" });
      if (
        identity.fingerprint !== applied.fingerprint ||
        identity.updatedAt !== applied.updatedAt ||
        adapter.version !== applied.adapterVersion ||
        new PageKnowledge(this.req).catalog().hash !== applied.catalogHash
      )
        throw new EndpointError(
          "CONFLICT",
          "Страница или схема изменена после применения. Автоматический откат запрещён.",
          409,
        );
      const patch = { layout: structuredClone(snapshot.beforePage.layout) };
      const expected: AIDocument = {
        ...revision.page,
        ...patch,
        _status: "draft",
      };
      await this.assertAccess(intent.pageID, patch);
      await this.repository.update(intent.pageID, patch);
      const restored = await this.repository.read(intent.pageID);
      this.assertSaved(restored, expected, revision);
      return String(restored.page.updatedAt);
    });
  }

  private adapter(): PageDraftStructureAdapter {
    const runtime = this.payload.config.custom?.[
      REALIZE_AI_SERVER_RUNTIME_KEY
    ] as RealizeAIServerRuntime | undefined;
    const adapter = runtime?.pageDraft?.structure;
    if (
      adapter?.version !== "1.0" ||
      runtime?.pageDraft?.text?.version !== "1.0" ||
      typeof adapter.patch !== "function" ||
      typeof adapter.previewContent !== "function"
    )
      throw new EndpointError(
        "CONFLICT",
        "Редактирование структуры Content не подключено к схеме проекта.",
        409,
      );
    return adapter;
  }

  private async snapshot(
    intent: UpdatePageStructureDraftIntent,
    revision: PageDraftRevision,
    adapter: PageDraftStructureAdapter,
  ): Promise<PageDraftStructureSnapshot> {
    if (Buffer.byteLength(JSON.stringify(revision.page), "utf8") > 1024 * 1024)
      throw new EndpointError(
        "INVALID_REQUEST",
        "Страница превышает границу структурного редактирования 1 MiB.",
        400,
      );
    const identity = this.revisionIdentity(revision, { version: "1.0" });
    if (
      identity.updatedAt !== intent.expectedUpdatedAt ||
      identity.fingerprint !== intent.expectedFingerprint
    )
      throw new EndpointError(
        "CONFLICT",
        "Версия страницы изменилась. Перечитайте структуру и подготовьте новый план.",
        409,
      );
    const knowledge = await new PageKnowledge(this.req).read(
      revision.page,
      identity.fingerprint,
      0,
    );
    if (knowledge.catalogHash !== intent.expectedCatalogHash)
      throw new EndpointError(
        "CONFLICT",
        "Схема страницы изменилась. Перечитайте структуру и подготовьте новый план.",
        409,
      );
    const context = parsePageStructureContext({
      page: identity.page,
      updatedAt: identity.updatedAt,
      fingerprint: identity.fingerprint,
      knowledge,
    });
    // Серверные IDs зависят от того же intent/revision: повторный dry-run не меняет approved hash.
    const insertionIDs =
      intent.operation.type === "insert"
        ? {
            blockID: hashCanonicalJSON({
              domain: "realize:pages:content:block:1.0",
              intent,
            }).slice(0, 24),
            columnID: hashCanonicalJSON({
              domain: "realize:pages:content:column:1.0",
              intent,
            }).slice(0, 24),
          }
        : undefined;
    const writeData = this.hostResult(() =>
      adapter.patch(
        structuredClone(revision.page),
        intent.operation,
        insertionIDs,
      ),
    );
    const expectedPage = validatePageDraftStructurePatch(
      revision.page,
      writeData,
      intent.operation,
      insertionIDs,
    );
    if (Buffer.byteLength(JSON.stringify(expectedPage), "utf8") > 1024 * 1024)
      throw new EndpointError(
        "INVALID_REQUEST",
        "Изменённая страница превышает границу структурного редактирования 1 MiB.",
        400,
      );
    const before = revision.page.layout as Record<string, unknown>[];
    const after = expectedPage.layout as Record<string, unknown>[];
    const blockID =
      intent.operation.type === "insert"
        ? insertionIDs!.blockID
        : intent.operation.blockID;
    const beforeIndex = before.findIndex((block) => block.id === blockID);
    const afterIndex = after.findIndex((block) => block.id === blockID);
    const content =
      intent.operation.type === "move"
        ? undefined
        : this.hostResult(() =>
            parsePageDraftContentPreview(
              adapter.previewContent(
                structuredClone(
                  intent.operation.type === "insert"
                    ? after[afterIndex]
                    : before[beforeIndex],
                ),
              ),
            ),
          );
    const preview = parsePageDraftStructurePreview({
      page: context.page,
      status: "draft",
      action: intent.operation.type,
      blockID,
      beforeIndex: beforeIndex < 0 ? null : beforeIndex,
      afterIndex: afterIndex < 0 ? null : afterIndex,
      totalBefore: before.length,
      totalAfter: after.length,
      beforeBlockID:
        intent.operation.type === "remove"
          ? null
          : intent.operation.beforeBlockID,
      ...(content ? { content } : {}),
    });
    return {
      context,
      beforePage: revision.page,
      writeData,
      expectedPage,
      baseFingerprint: revision.baseFingerprint,
      publicationFingerprint: revision.publicationFingerprint,
      adapterVersion: adapter.version,
      preview,
    };
  }
}
