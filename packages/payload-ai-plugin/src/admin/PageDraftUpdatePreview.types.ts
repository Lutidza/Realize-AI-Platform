/**
 * @file packages/payload-ai-plugin/src/admin/PageDraftUpdatePreview.types.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Задаёт публичные данные представления точного diff черновика.
 */
import type { PageDraftUpdateOperationDTO } from "@realize/ai-contracts";

export type PageDraftUpdatePreviewProps = {
  operation: PageDraftUpdateOperationDTO;
};
