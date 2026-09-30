/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopPreview.types.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Описывает контекст предпросмотра сохранённой версии редактора.
 * @see documentation/specifications/design-workshop.md
 */
import type { DesignRevisionDto } from "@realize/ai-contracts";

export type WorkshopPreviewProps = {
  projectId: string;
  revision: DesignRevisionDto;
  dirty: boolean;
  enabled: boolean;
};
