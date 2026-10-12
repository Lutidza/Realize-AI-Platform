/**
 * @file packages/template-realize/src/realizeTemplateSettings.index.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Экспортирует один server/client settings validator без renderer и CSS.
 * @see documentation/specifications/extension-management.md
 */
export { resolveRealizeSettings } from "./settings/resolveRealizeSettings.validator";
export { realizeSettingsSchema } from "./settings/realizeSettings.schemas";
export type { RealizeSettings } from "./settings/RealizeSettings.types";
