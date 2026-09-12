/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationCard.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт свойства карточки подтверждения и предпросмотра изменений данных.
 */

import type {
  DataOperationDTO,
  PageDraftCreationOperationDTO,
} from "@realize/ai-contracts";

/** Карточка вызывает действия с точной версией операции, подготовленные владельцем состояния. */
export type DataOperationCardProps = {
  /** Сообщает о неотправленной причине отклонения для защиты навигации. */
  onDraftChange?: (dirty: boolean) => void;
  onApply: () => void;
  onApprove: () => void;
  onApproveRollback: () => void;
  onReject: (comment: string) => void;
  onRollback: () => void;
  operation: DataOperationDTO;
  pending: boolean;
};

export type DataOperationPreviewProps = Pick<
  DataOperationCardProps,
  "operation"
>;

export type PageDraftPreviewProps = {
  operation: PageDraftCreationOperationDTO;
};
