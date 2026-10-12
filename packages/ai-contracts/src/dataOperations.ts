/**
 * @file packages/ai-contracts/src/dataOperations.ts
 * @version 1.3.1
 * @date 2026-10-12
 * @description Задаёт общие контракты и discriminated union управляемых операций Payload Data Lane.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type {
  CreatePageDraftIntent,
  PageDraftCreationOperationDTO,
} from "./PageDraftCreation.types";
import type {
  PageDraftUpdateOperationDTO,
  UpdatePageDraftIntent,
} from "./PageDraftUpdate.types";

import type {
  UpdatePageStructureDraftIntent,
  PageDraftStructureOperationDTO,
} from "./PageDraftStructure.types";
import type {
  PagePublicationOperationDTO,
  PagePublicationRestoreOperationDTO,
  PagePublicationReviewEvidenceDTO,
  PagePublicationReviewInput,
} from "./PagePublication.types";

/** Закрытый список реализованных и проверяемых операций Data Lane. */
export type DataOperationKind =
  | "catalog.assignCategory.v1"
  | "pages.createDraft.v1"
  | "pages.updateDraft.v1"
  | "pages.updateStructureDraft.v1"
  | "pages.publishDraft.v1"
  | "pages.restorePublication.v1";

/** Декларативное предложение никогда не предоставляет право записи модели. */
export type DataOperationIntent =
  | AssignProductCategoryIntent
  | CreatePageDraftIntent
  | UpdatePageDraftIntent
  | UpdatePageStructureDraftIntent;

/** Явный selector ассистента; допускается ровно один ключ. */
export type DataEntitySelector =
  { id: string } | { slug: string } | { title: string };

/** Предложение ассистента; само по себе не предоставляет право записи. */
export type AssignProductCategoryIntent = {
  category: DataEntitySelector;
  kind: "catalog.assignCategory.v1";
  product: DataEntitySelector;
  version: "1.0";
};

/** Ограниченная публичная идентичность документа для Payload Admin. */
export type DataDocumentRefDTO = {
  id: string;
  slug?: string;
  title: string;
};

/** Проекция состояния до и после без записи в рабочие данные. */
export type CategoryAssignmentPreviewDTO = {
  addedCategories: DataDocumentRefDTO[];
  afterCategories: DataDocumentRefDTO[];
  beforeCategories: DataDocumentRefDTO[];
  category: DataDocumentRefDTO;
  product: DataDocumentRefDTO;
};

/** Сохраняемый жизненный цикл одной управляемой операции данных. */
export type DataOperationState =
  | "apply_failed"
  | "applied"
  | "approved"
  | "awaiting_approval"
  | "rejected"
  | "rollback_approved"
  | "rollback_failed"
  | "rolled_back";

/** Привязанное к hash решение администратора без raw Payload user data. */
export type DataOperationApprovalDTO = {
  actorRole: string;
  boundHash: string;
  comment?: string;
  createdAt: string;
  decision: "approved" | "rejected";
  expiresAt: string;
  id: string;
  targetHash: string;
  type: "ROLLBACK_APPROVAL" | "WRITE_CONFIRMATION";
  previewEvidence?: PagePublicationReviewEvidenceDTO;
};

/** Общий жизненный цикл подготовки, подтверждения и компенсирующего отката. */
export type DataOperationBaseDTO = {
  approval?: DataOperationApprovalDTO;
  appliedAt?: string;
  conversationID: string;
  createdAt: string;
  errorSummary?: string;
  estimatedCount: 1;
  expiresAt: string;
  id: string;
  operationHash: string;
  riskLevel: "R1";
  rollbackApproval?: DataOperationApprovalDTO;
  rollbackHash: string;
  rolledBackAt?: string;
  sourceMessageID: string;
  state: DataOperationState;
  title: string;
  updatedAt: string;
  version: number;
};

/** Совместимый публичный контракт назначения категории существующему товару. */
export type CategoryAssignmentOperationDTO = DataOperationBaseDTO & {
  expectedTargetUpdatedAt: string;
  kind: "catalog.assignCategory.v1";
  preview: CategoryAssignmentPreviewDTO;
  rollbackStrategy: "before-snapshot";
};

/** kind однозначно определяет preview, результат записи и стратегию отката. */
export type DataOperationDTO =
  | CategoryAssignmentOperationDTO
  | PageDraftCreationOperationDTO
  | PageDraftUpdateOperationDTO
  | PageDraftStructureOperationDTO
  | PagePublicationOperationDTO
  | PagePublicationRestoreOperationDTO;

/** Выбирает сохранённый ответ ассистента как источник предложения. */
export type CreateDataOperationInput = {
  sourceMessageID: string;
};

/** Подтверждает или отклоняет точную версию подготовленного изменения. */
export type DecideDataOperationInput = {
  comment?: string;
  expectedOperationHash: string;
  expectedVersion: number;
  previewReview?: PagePublicationReviewInput;
};

/** Применяет точную подтверждённую операцию. */
export type ApplyDataOperationInput = {
  expectedOperationHash: string;
  expectedVersion: number;
};

/** Подтверждает или выполняет компенсирующий откат точного snapshot. */
export type DataRollbackInput = {
  comment?: string;
  expectedRollbackHash: string;
  expectedVersion: number;
};
