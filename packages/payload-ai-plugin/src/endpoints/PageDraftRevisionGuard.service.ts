/**
 * @file packages/payload-ai-plugin/src/endpoints/PageDraftRevisionGuard.service.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Общие ACL, блокировка и точная идентичность ревизии для изменений Pages.
 */
import { ContractValidationError } from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";
import { EndpointError } from "./http";
import { lockAITransaction } from "./lockAITransaction.util";
import { withPayloadTransaction } from "./payloadTransaction";
import type {
  PageDraftRevision,
  PageDraftTextAdapter,
} from "./PageDraftUpdate.types";
import type { AIDocument } from "./repository";

/** updatedAt меняется при сохранении версии; остальные поля должны остаться точными. */
const contentHash = (page: AIDocument): string =>
  hashCanonicalJSON(
    Object.fromEntries(
      Object.entries(page).filter(([key]) => key !== "updatedAt"),
    ),
  );

/** Общий owner не меняет fingerprint и правила сохранения прежнего текстового Data Lane. */
export class PageDraftRevisionGuard {
  constructor(
    protected readonly payload: Payload,
    protected readonly req: PayloadRequest,
  ) {}
  protected revisionIdentity(
    revision: PageDraftRevision,
    adapter: Pick<PageDraftTextAdapter, "version">,
  ) {
    const page = revision.page;
    return {
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
    };
  }

  protected assertSaved(
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

  protected async assertAccess(
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

  protected hostResult<T>(work: () => T): T {
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

  protected async locked<T>(work: () => Promise<T>): Promise<T> {
    return await withPayloadTransaction(this.req, async () => {
      await lockAITransaction(this.req, "page-drafts");
      return await work();
    });
  }
}
