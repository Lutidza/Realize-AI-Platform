/**
 * @file packages/payload-ai-plugin/src/endpoints/PagePublication.repository.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Читает основную строку и записывает публикацию с ACL/editor lock в общей транзакции Pages.
 */
import {
  Forbidden,
  Locked,
  NotFound,
  type Payload,
  type PayloadRequest,
} from "payload";
import type { PageDraftUpdateLocalAPI } from "./PageDraftUpdate.types";
import type { AIDocument } from "./repository";
import { EndpointError } from "./http";
import { pagePublicationWriteData } from "./pagePublicationWriteData.mapper";

export class PagePublicationRepository {
  private readonly api: PageDraftUpdateLocalAPI;
  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as PageDraftUpdateLocalAPI;
  }
  async base(pageID: string): Promise<AIDocument> {
    const result = await this.api.find({
      collection: "pages",
      draft: false,
      where: { id: { equals: pageID } },
      depth: 0,
      limit: 2,
      pagination: false,
      overrideAccess: false,
      req: this.req,
    });
    if (result.docs.length !== 1 || String(result.docs[0].id) !== pageID)
      throw new EndpointError(
        "CONFLICT",
        "Публичная версия страницы недоступна.",
        409,
      );
    return result.docs[0];
  }
  async write(
    pageID: string,
    target: AIDocument,
    current: AIDocument,
    status: "draft" | "published",
    draft: boolean,
  ): Promise<void> {
    const context = this.req.context;
    this.req.context = { ...context, disableRevalidate: true };
    try {
      await this.api.update({
        collection: "pages",
        id: pageID,
        data: pagePublicationWriteData(target, current, status),
        draft,
        depth: 0,
        overrideAccess: false,
        overrideLock: false,
        req: this.req,
      });
    } catch (error) {
      if (error instanceof Locked)
        throw new EndpointError(
          "CONFLICT",
          "Страницу редактирует другой пользователь. Повторите подготовку после завершения его работы.",
          409,
        );
      if (error instanceof Forbidden)
        throw new EndpointError(
          "FORBIDDEN",
          "Недостаточно прав для изменения публикации.",
          403,
        );
      if (error instanceof NotFound)
        throw new EndpointError(
          "CONFLICT",
          "Страница удалена или больше недоступна.",
          409,
        );
      throw error;
    } finally {
      this.req.context = context;
    }
  }
}
