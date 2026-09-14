/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublication.service.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Готовит и записывает точную публикацию либо восстановление публичной версии под общим Pages lock.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  parsePagePublicationChecks,
  parseApplyDataOperationInput,
  parsePagePublicationPreview,
  type PreparePagePublicationInput,
  type PreparePagePublicationRestoreInput,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";
import { PageDraftRevisionGuard } from "./PageDraftRevisionGuard.service";
import { PageDraftUpdateRepository } from "./PageDraftUpdate.repository";
import { PageKnowledge } from "./pageKnowledge.service";
import { PagePublicationRepository } from "./PagePublication.repository";
import { DataOperationRepository } from "./dataOperationRepository";
import { requirePagePublicationAccess } from "./pagePublicationAccess.service";
import {
  pagePublicationOperationHash,
  pagePublicationRef,
  readPagePublicationSnapshot,
} from "./pagePublicationSnapshot.mapper";
import { assertPagePublicationContent } from "./pagePublicationWriteData.mapper";
import { EndpointError } from "./http";
import type { AIDocument } from "./repository";
import type {
  AppliedPagePublicationSnapshot,
  PagePublicationSnapshot,
  PagePublicationSource,
} from "./PagePublication.types";

const stale = () =>
  new EndpointError(
    "CONFLICT",
    "Страница, публикация или условия проверки изменились. Подготовьте новую операцию для актуальной версии.",
    409,
  );

/** Все записи наследуют внешнюю transaction DataOperation; cache вызывается отдельным post-commit handler. */
export class PagePublication extends PageDraftRevisionGuard {
  private readonly revisions: PageDraftUpdateRepository;
  private readonly pages: PagePublicationRepository;
  constructor(payload: Payload, req: PayloadRequest) {
    super(payload, req);
    this.revisions = new PageDraftUpdateRepository(payload, req);
    this.pages = new PagePublicationRepository(payload, req);
  }

  async prepare(
    sourceID: string,
    input: PreparePagePublicationInput | PreparePagePublicationRestoreInput,
    mode: "publish" | "restore",
  ) {
    const expected = parseApplyDataOperationInput(input);
    await requirePagePublicationAccess(this.req);
    return await this.locked(async () => {
      const source = {
        id: sourceID,
        version: expected.expectedVersion,
        operationHash: expected.expectedOperationHash,
      };
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const snapshot = await this.snapshot(source, mode);
      return { snapshot, expiresAt };
    });
  }

  /** Approval и apply повторяют те же правила и source identity; сохранённый план не переинтерпретируется. */
  async assertCurrent(operation: AIDocument): Promise<PagePublicationSnapshot> {
    await requirePagePublicationAccess(this.req);
    return await this.locked(async () => {
      const saved = readPagePublicationSnapshot(operation);
      if (
        typeof operation.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(operation.expiresAt)) ||
        Date.parse(operation.expiresAt) <= Date.now()
      )
        throw stale();
      const actual = await this.snapshot(saved.source, saved.mode);
      if (pagePublicationOperationHash(actual) !== operation.operationHash)
        throw stale();
      return actual;
    });
  }

  async apply(operation: AIDocument): Promise<{
    appliedSnapshot: AppliedPagePublicationSnapshot;
    rollbackHash: string;
  }> {
    await requirePagePublicationAccess(this.req);
    return await this.locked(async () => {
      const snapshot = await this.assertCurrent(operation);
      const pageID = snapshot.preview.page.id;
      const status =
        snapshot.preview.after.status === "published" ? "published" : "draft";
      await this.assertAccess(pageID, { _status: status });
      await this.pages.write(
        pageID,
        snapshot.targetPage,
        snapshot.revision.page,
        status,
        false,
      );
      const savedBase = await this.pages.base(pageID);
      assertPagePublicationContent(savedBase, snapshot.targetPage, status);
      if (snapshot.mode === "restore") {
        await this.pages.write(
          pageID,
          snapshot.preservedDraft,
          savedBase,
          "draft",
          true,
        );
      }
      const revision = await this.revisions.read(pageID);
      const base = await this.pages.base(pageID);
      if (hashCanonicalJSON(base) !== hashCanonicalJSON(savedBase))
        throw stale();
      assertPagePublicationContent(
        revision.page,
        snapshot.mode === "publish" ? base : snapshot.preservedDraft,
        snapshot.mode === "publish" ? "published" : "draft",
      );
      const page = pagePublicationRef(base);
      if (!page.slug) throw stale();
      const appliedSnapshot: AppliedPagePublicationSnapshot = {
        pageID,
        title: page.title,
        slug: page.slug,
        updatedAt: String(revision.page.updatedAt),
        adminUrl: `${this.payload.config.routes.admin}/collections/pages/${encodeURIComponent(pageID)}`,
        ...(status === "published"
          ? {
              publicUrl:
                page.slug === "home"
                  ? "/"
                  : `/${encodeURIComponent(page.slug)}`,
            }
          : {}),
        baseFingerprint: hashCanonicalJSON(base),
        revision,
      };
      return {
        appliedSnapshot,
        rollbackHash: hashCanonicalJSON({
          kind: "pages.restorePublication.reference.v1",
          operationHash: operation.operationHash,
          baseFingerprint: appliedSnapshot.baseFingerprint,
        }),
      };
    });
  }

  private async snapshot(
    source: PagePublicationSource,
    mode: "publish" | "restore",
  ): Promise<PagePublicationSnapshot> {
    const adapter = await requirePagePublicationAccess(this.req);
    const catalogHash = new PageKnowledge(this.req).catalog().hash;
    const operation = await new DataOperationRepository(
      this.payload,
      this.req,
    ).getOwnedOperation(source.id, String(this.req.user!.id));
    if (
      operation.version !== source.version ||
      operation.operationHash !== source.operationHash
    )
      throw stale();
    let pageID: string;
    let previous: PagePublicationSnapshot | undefined;
    if (mode === "publish") {
      const applied = operation.appliedSnapshot as AIDocument | undefined;
      if (
        operation.state !== "applied" ||
        ![
          "pages.createDraft.v1",
          "pages.updateDraft.v1",
          "pages.updateStructureDraft.v1",
        ].includes(String(operation.kind)) ||
        !applied ||
        typeof applied.pageID !== "string"
      )
        throw stale();
      pageID = applied.pageID;
    } else {
      if (
        operation.kind !== "pages.publishDraft.v1" ||
        operation.state !== "applied"
      )
        throw stale();
      previous = readPagePublicationSnapshot(operation);
      pageID = previous.preview.page.id;
    }
    await this.assertAccess(pageID);
    const revision = await this.revisions.read(pageID);
    if (mode === "publish") {
      // Live Preview читает актуальный draft. План принимается только для точного результата исходной операции.
      const applied = operation.appliedSnapshot as AIDocument;
      const identity = this.revisionIdentity(revision, { version: "1.0" });
      const fingerprint =
        operation.kind === "pages.createDraft.v1"
          ? hashCanonicalJSON(revision.page)
          : identity.fingerprint;
      if (
        revision.page._status !== "draft" ||
        applied.updatedAt !== identity.updatedAt ||
        applied.fingerprint !== fingerprint ||
        (operation.kind !== "pages.createDraft.v1" &&
          applied.adapterVersion !== "1.0")
      )
        throw stale();
    }
    const beforePage = await this.pages.base(pageID);
    if (revision.baseFingerprint !== hashCanonicalJSON(beforePage))
      throw stale();
    if (
      mode === "restore" &&
      (operation.appliedSnapshot as AppliedPagePublicationSnapshot | undefined)
        ?.baseFingerprint !== revision.baseFingerprint
    )
      throw stale();
    const targetPage =
      mode === "publish"
        ? structuredClone(revision.page)
        : previous!.beforePage._status === "published"
          ? structuredClone(previous!.beforePage)
          : { ...structuredClone(previous!.targetPage), _status: "draft" };
    const targetStatus =
      mode === "publish" || targetPage._status === "published"
        ? "published"
        : "draft";
    const preservedDraft = {
      ...structuredClone(revision.page),
      _status: "draft",
    };
    await this.assertAccess(pageID, { _status: targetStatus });
    const policy = await adapter.check(structuredClone(targetPage), this.req);
    const checks = parsePagePublicationChecks(policy.checks);
    if (!/^[a-f0-9]{64}$/.test(policy.policyHash)) throw stale();
    const blocker = checks.find(
      (check) => check.severity === "error" && check.status !== "passed",
    );
    if (blocker)
      throw new EndpointError("CONFLICT", blocker.message, 409, { checks });
    if (
      new PageKnowledge(this.req).catalog().hash !== catalogHash ||
      hashCanonicalJSON(await this.revisions.read(pageID)) !==
        hashCanonicalJSON(revision) ||
      hashCanonicalJSON(await this.pages.base(pageID)) !==
        hashCanonicalJSON(beforePage)
    )
      throw stale();
    const identity = {
      version: "1.0" as const,
      mode,
      source,
      catalogHash,
      revision,
      beforePage,
      targetPage,
      preservedDraft,
    };
    if (Buffer.byteLength(JSON.stringify(identity), "utf8") > 4 * 1024 * 1024)
      throw new EndpointError(
        "INVALID_REQUEST",
        "Снимок страницы превышает ограничение публикации.",
        400,
      );
    const manifestHash = hashCanonicalJSON({
      kind: "pages.publication.manifest.v1",
      ...identity,
      policyHash: policy.policyHash,
      checks,
    });
    const preview = parsePagePublicationPreview({
      page: pagePublicationRef(targetPage),
      sourceOperationID: source.id,
      manifestHash,
      policyHash: policy.policyHash,
      checks,
      before: {
        status:
          beforePage._status === "published" ? "published" : "unpublished",
        page: pagePublicationRef(beforePage),
      },
      after: {
        status: targetStatus === "published" ? "published" : "unpublished",
        page: pagePublicationRef(targetPage),
      },
    });
    return { ...identity, preview };
  }
}
