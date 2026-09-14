/**
 * @file packages/ai-contracts/src/PageDraftUpdate.types.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Задаёт ограниченный текстовый контекст страницы и подтверждаемый diff её черновика.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type {
  DataDocumentRefDTO,
  DataOperationBaseDTO,
} from "./dataOperations";
import type { PageKnowledgeDTO } from "./PageKnowledge.types";
import type { PageDraftCreationResultDTO } from "./PageDraftCreation.types";

/** Только разрешённый текстовый лист; path задаёт серверный host adapter. */
export type PageDraftTextFieldDTO = {
  path: string;
  label: string;
  value: string;
  maxLength: number;
};

/** Недоверенный контент для чтения моделью, привязанный к полной серверной ревизии. */
export type PageDraftContextDTO = {
  page: DataDocumentRefDTO;
  updatedAt: string;
  fingerprint: string;
  adapterVersion: string;
  fields: PageDraftTextFieldDTO[];
  knowledge?: PageKnowledgeDTO;
};

/** Browser передаёт только выбор; текст и ревизию сервер повторно читает сам. */
export type PageDraftReference = { id: string; fingerprint: string };

/** Серверная страница поиска для явного выбора одной CMS-страницы в чате. */
export type PageDraftCatalogDTO = {
  pages: DataDocumentRefDTO[];
  page: number;
  totalPages: number;
  totalDocs: number;
};

/** before и after сохраняют исходные пробелы: diff и CAS сравнивают точный текст. */
export type PageDraftTextChange = {
  path: string;
  before: string;
  after: string;
};

/** Предложение изменения текста; не допускает slug, публикацию или Payload-структуру. */
export type UpdatePageDraftIntent = {
  version: "1.0";
  kind: "pages.updateDraft.v1";
  pageID: string;
  expectedUpdatedAt: string;
  expectedFingerprint: string;
  changes: PageDraftTextChange[];
};

/** Точный diff для подтверждения администратором до записи в черновик. */
export type PageDraftUpdatePreviewDTO = {
  page: DataDocumentRefDTO;
  changes: Array<PageDraftTextChange & { label: string }>;
  status: "draft";
};

/** Откат восстанавливает зафиксированный snapshot только при неизменённой ревизии. */
export type PageDraftUpdateOperationDTO = DataOperationBaseDTO & {
  kind: "pages.updateDraft.v1";
  preview: PageDraftUpdatePreviewDTO;
  expectedTargetUpdatedAt: string;
  rollbackStrategy: "before-snapshot";
  result?: PageDraftCreationResultDTO;
};
