/**
 * @file packages/template-contracts/src/templateContracts.index.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Экспортирует serializable manifest API без React runtime и host-зависимостей.
 */

export { TemplateContractError } from "./TemplateContract.error";
export { parseTemplateManifest } from "./parseTemplateManifest.validator";
export { isTemplateSettings } from "./isTemplateSettings.validator";
export { resolveTemplateSelection } from "./resolveTemplateSelection.validator";
export {
  templateManifestSchema,
  templateSelectionSchema,
  templateHostCompatibilitySchema,
} from "./templateManifest.schemas";
export type {
  TemplateManifest,
  TemplateContractErrorCode,
  TemplateSelection,
  TemplateHostCompatibility,
  TemplateTarget,
  TemplateMode,
  TemplateCapabilityId,
  TemplatePaletteManifest,
  ResolvedTemplateSelection,
} from "./TemplateManifest.types";
export type {
  TemplateJsonValue,
  TemplateSettings,
} from "./TemplateValue.types";
