/**
 * @file packages/ai-contracts/src/PagePublication.types.ts
 * @version 2.1.0
 * @date 2026-09-14
 * @description Контракты отдельной публикации, подтверждения просмотра и восстановления публичной версии Pages.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type {
  DataDocumentRefDTO,
  DataOperationBaseDTO,
  ApplyDataOperationInput,
} from "./dataOperations";

/** Клиент выбирает сохранённую операцию; просмотр выполняется штатным Live Preview Payload. */
export type PreparePagePublicationInput = ApplyDataOperationInput;
export type PreparePagePublicationRestoreInput = ApplyDataOperationInput;

/** Проверка публикации сообщает покрытие, но не заменяет просмотр пользователем. */
export type PagePublicationCheckDTO = {
  id: string;
  status: "passed" | "failed" | "not_checked";
  severity: "error" | "warning" | "info";
  target?: string;
  message: string;
};

/** Явное свидетельство пользователя, а не автоматическое доказательство browser audit. */
export type PagePublicationReviewInput = {
  manifestHash: string;
  desktop: true;
  mobile: true;
  noErrors: true;
};
export type PagePublicationReviewEvidenceDTO = PagePublicationReviewInput & {
  version: "1.0";
  reviewedAt: string;
};

export type PagePublicationStateDTO = {
  status: "published" | "unpublished";
  page: DataDocumentRefDTO;
};
export type PagePublicationPreviewDTO = {
  page: DataDocumentRefDTO;
  sourceOperationID: string;
  manifestHash: string;
  policyHash: string;
  checks: PagePublicationCheckDTO[];
  before: PagePublicationStateDTO;
  after: PagePublicationStateDTO;
};

/** Инвалидация кэша отделена от DB commit; повтор доставки не повторяет публикацию. */
export type PagePublicationDeliveryDTO = {
  status: "pending" | "succeeded" | "failed";
  message?: string;
  deliveredAt?: string;
};
export type PagePublicationResultDTO = {
  page: DataDocumentRefDTO;
  adminUrl: string;
  publicUrl?: string;
  delivery: PagePublicationDeliveryDTO;
};
type PagePublicationOperationBaseDTO = Omit<
  DataOperationBaseDTO,
  "riskLevel"
> & {
  riskLevel: "R2";
  adminUrl: string;
  /** Переход к configured admin.preview; URL не содержит previewSecret. */
  frontendPreviewUrl: string;
  expectedTargetUpdatedAt: string;
  preview: PagePublicationPreviewDTO;
  result?: PagePublicationResultDTO;
};
export type PagePublicationOperationDTO = PagePublicationOperationBaseDTO & {
  kind: "pages.publishDraft.v1";
  rollbackStrategy: "restore-publication";
};
export type PagePublicationRestoreOperationDTO =
  PagePublicationOperationBaseDTO & {
    kind: "pages.restorePublication.v1";
    rollbackStrategy: "none";
  };
