/**
 * @file packages/payload-ai-plugin/src/endpoints/PageDraftUpdate.repository.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Читает draft, основную строку и историю публикации с правами текущего запроса.
 */
import { hashCanonicalJSON } from "@realize/change-engine";
import {
  Forbidden,
  Locked,
  NotFound,
  type Payload,
  type PayloadRequest,
} from "payload";
import { EndpointError } from "./http";
import type {
  PageDraftRevision,
  PageDraftUpdateLocalAPI,
} from "./PageDraftUpdate.types";

/** Запросы наследуют транзакцию сервиса; Local API не обходит access и editor lock. */
export class PageDraftUpdateRepository {
  private readonly api: PageDraftUpdateLocalAPI;
  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as PageDraftUpdateLocalAPI;
  }

  async read(pageID: string): Promise<PageDraftRevision> {
    const common = {
      collection: "pages",
      depth: 0,
      limit: 2,
      pagination: false,
      overrideAccess: false,
      req: this.req,
    };
    const where = { id: { equals: pageID } };
    const draft = await this.api.find({ ...common, draft: true, where });
    const base = await this.api.find({ ...common, draft: false, where });
    const latest = await this.api.findVersions({
      ...common,
      where: {
        and: [{ parent: { equals: pageID } }, { latest: { equals: true } }],
      },
    });
    const publication = await this.api.findVersions({
      ...common,
      limit: 1,
      sort: ["-updatedAt", "-id"],
      where: {
        and: [
          { parent: { equals: pageID } },
          { "version._status": { equals: "published" } },
        ],
      },
    });
    if (
      draft.docs.length !== 1 ||
      base.docs.length !== 1 ||
      latest.docs.length !== 1
    )
      throw new EndpointError(
        "CONFLICT",
        "Страница удалена, недоступна или не имеет однозначной последней версии.",
        409,
      );
    const page = draft.docs[0];
    const version = latest.docs[0];
    if (
      String(page.id) !== pageID ||
      !["draft", "published"].includes(String(page._status)) ||
      typeof page.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(page.updatedAt)) ||
      version.id == null ||
      typeof version.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(version.updatedAt))
    )
      throw new EndpointError(
        "CONFLICT",
        "У страницы отсутствует проверяемая версия черновика.",
        409,
      );
    return {
      page,
      latestVersion: { id: String(version.id), updatedAt: version.updatedAt },
      baseFingerprint: hashCanonicalJSON(base.docs[0]),
      // latest переключается при обычном сохранении draft и не является новой публикацией.
      publicationFingerprint: hashCanonicalJSON(
        publication.docs[0]
          ? {
              id: publication.docs[0].id,
              updatedAt: publication.docs[0].updatedAt,
              version: publication.docs[0].version,
            }
          : null,
      ),
    };
  }

  async update(pageID: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.api.update({
        collection: "pages",
        id: pageID,
        data: { ...data, _status: "draft" },
        draft: true,
        depth: 0,
        overrideAccess: false,
        overrideLock: false,
        req: this.req,
      });
    } catch (error) {
      if (error instanceof Locked)
        throw new EndpointError(
          "CONFLICT",
          "Страница заблокирована другим редактором. Дождитесь завершения его работы и подготовьте новый план.",
          409,
        );
      if (error instanceof Forbidden)
        throw new EndpointError(
          "FORBIDDEN",
          "Недостаточно прав для сохранения черновика страницы.",
          403,
        );
      if (error instanceof NotFound)
        throw new EndpointError(
          "CONFLICT",
          "Страница удалена или больше недоступна. Подготовьте новый план.",
          409,
        );
      throw error;
    }
  }
}
