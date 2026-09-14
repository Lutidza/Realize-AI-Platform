/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationCard.types.ts
 * @version 1.2.0
 * @date 2026-09-14
 * @description Задаёт свойства карточки подтверждения и предпросмотра изменений данных.
 */

import type {
  DataOperationDTO,
  PageDraftCreationOperationDTO,
  PagePublicationReviewInput,
} from "@realize/ai-contracts";
import type { DataOperationStaleMarker } from "./DataOperationActions.types";

/** Карточка вызывает действия с точной версией операции, подготовленные владельцем состояния. */
export type DataOperationCardProps = {
  /** Сообщает о неотправленной причине отклонения для защиты навигации. */
  onDraftChange?: (dirty: boolean) => void;
  onApply: () => void;
  onApprove: (previewReview?: PagePublicationReviewInput) => void;
  onApproveRollback: () => void;
  onReject: (comment: string) => void;
  onRollback: () => void;
  operation: DataOperationDTO;
  pending: boolean;
  onPreparePublication?: () => void;
  onPreparePublicationRestore?: () => void;
  onRetryPublicationDelivery?: () => void;
  staleMarker?: DataOperationStaleMarker;
};

export type DataOperationPreviewProps = Pick<
  DataOperationCardProps,
  "operation"
>;

export type PageDraftPreviewProps = {
  operation: PageDraftCreationOperationDTO;
};
