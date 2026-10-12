/**
 * @file packages/template-realize/src/realizeTemplate.index.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Экспортирует compiled Admin renderer и definition самостоятельного Realize package.
 * @see documentation/architecture/ui-kit.md
 */
export { RealizeTemplate } from "./RealizeTemplate.component";
export { realizeTemplateDefinition } from "./realizeTemplate.definition";
export { realizeTemplateManifest } from "./realizeTemplateManifest.index";
export { realizeSettingsSchema } from "./settings/realizeSettings.schemas";
export { resolveRealizeSettings } from "./settings/resolveRealizeSettings.validator";
export { getRealizeThemeStyle } from "./settings/getRealizeThemeStyle.util";
export type { RealizeSettings } from "./settings/RealizeSettings.types";
