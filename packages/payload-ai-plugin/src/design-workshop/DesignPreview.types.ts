/**
 * @file packages/payload-ai-plugin/src/design-workshop/DesignPreview.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Связывает очередь preview с generated collection без публичной выдачи record.
 * @see documentation/specifications/design-workshop.md
 */
import type { DataFromCollectionSlug } from "payload";
import type { DESIGN_PREVIEW_JOBS_SLUG } from "./designWorkshop.constants";
export type DesignPreviewRecord = DataFromCollectionSlug<
  typeof DESIGN_PREVIEW_JOBS_SLUG
>;
