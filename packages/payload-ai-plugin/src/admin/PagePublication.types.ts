/**
 * @file packages/payload-ai-plugin/src/admin/PagePublication.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Описывает ограниченные props публикационной карточки и пользовательского подтверждения просмотра.
 */
import type {
  PagePublicationOperationDTO,
  PagePublicationRestoreOperationDTO,
} from "@realize/ai-contracts";

export type PagePublicationOperationProps = {
  operation: PagePublicationOperationDTO | PagePublicationRestoreOperationDTO;
};
export type PagePublicationResultProps = PagePublicationOperationProps & {
  pending: boolean;
  onPrepareRestore?: () => void;
  onRetryDelivery?: () => void;
};
export type PagePublicationReviewChecks = {
  desktop: boolean;
  mobile: boolean;
  noErrors: boolean;
};
export type PagePublicationReviewProps = {
  checks: PagePublicationReviewChecks;
  disabled: boolean;
  onChange: (key: keyof PagePublicationReviewChecks, checked: boolean) => void;
};
