/**
 * @file services/ai-execution-worker/src/design-workshop/DesignPreview.error.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Ограничивает диагностику sandbox кодами без stderr и host paths.
 * @see documentation/specifications/design-workshop.md
 */
import type { DesignPreviewErrorCode } from "@realize/ai-contracts";
export class DesignPreviewError extends Error {
  constructor(readonly code: DesignPreviewErrorCode) {
    super("Не удалось подготовить предпросмотр макета.");
    this.name = "DesignPreviewError";
  }
}
