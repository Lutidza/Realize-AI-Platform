/**
 * @file packages/payload-ai-plugin/src/admin/PageDraftStructurePreview.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Задаёт проверенный preview одного изменения размещения Content для карточки подтверждения.
 */
import type { PageDraftStructureOperationDTO } from "@realize/ai-contracts";

export type PageDraftStructurePreviewProps = {
  operation: PageDraftStructureOperationDTO;
};
