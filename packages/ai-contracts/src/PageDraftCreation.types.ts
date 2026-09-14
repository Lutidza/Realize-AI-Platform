/**
 * @file packages/ai-contracts/src/PageDraftCreation.types.ts
 * @version 1.1.0
 * @date 2026-09-14
 * @description Задаёт безопасный текстовый intent и browser DTO создания черновика CMS-страницы.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type {
  DataDocumentRefDTO,
  DataOperationBaseDTO,
} from "./dataOperations";

/** Ограниченный обычный текст; Payload rich text создаётся только серверным mapper. */
export type PageDraftSection = {
  body: string;
  heading?: string;
};

/** Предложение создания одной страницы; публикация и произвольные Payload-поля недоступны. */
export type CreatePageDraftIntent = {
  description?: string;
  kind: "pages.createDraft.v1";
  sections: PageDraftSection[];
  slug: string;
  title: string;
  version: "1.0";
};

/** Точное содержание будущего черновика до подтверждения и записи. */
export type PageDraftCreationPreviewDTO = {
  description?: string;
  sections: PageDraftSection[];
  slug: string;
  status: "draft";
  title: string;
};

/** Серверные ссылки редактора и штатного предпросмотра без секрета в DTO. */
export type PageDraftCreationResultDTO = {
  adminUrl: string;
  frontendPreviewUrl: string;
  page: DataDocumentRefDTO;
};

/** Откат удаляет только неизменённый черновик, созданный именно этой операцией. */
export type PageDraftCreationOperationDTO = DataOperationBaseDTO & {
  kind: "pages.createDraft.v1";
  preview: PageDraftCreationPreviewDTO;
  result?: PageDraftCreationResultDTO;
  rollbackStrategy: "delete-created-draft";
};
