/**
 * @file packages/template-contracts/src/templateContracts.index.ts
 * @version 1.3.0
 * @date 2026-11-18
 * @description Экспортирует browser-safe template и layout contracts без React runtime и host-зависимостей.
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
export { LayoutContractError } from "./layouts/LayoutContract.error";
export {
  layoutDefinitionVersionSchema,
  layoutVersionedRefSchema,
  layoutSlotKeySchema,
  layoutRegionSchema,
  layoutGuideSchema,
  layoutDescriptorSchema,
} from "./layouts/layoutDescriptor.schemas";
export {
  templateLayoutLocalIdSchema,
  templateLayoutAliasSchema,
  templateLayoutCatalogInputSchema,
  templateLayoutCatalogSchema,
} from "./layouts/templateLayoutCatalog.schemas";
export { parseLayoutDescriptor } from "./layouts/parseLayoutDescriptor.validator";
export { layoutAssignmentBindingSchema } from "./layouts/layoutAssignmentBinding.schemas";
export { parseLayoutAssignmentBinding } from "./layouts/parseLayoutAssignmentBinding.validator";
export { parseTemplateLayoutCatalog } from "./layouts/parseTemplateLayoutCatalog.validator";
export { resolveTemplateLayout } from "./layouts/resolveTemplateLayout.service";
export { assertLayoutSlots } from "./layouts/assertLayoutSlots.validator";
export type {
  LayoutDescriptorInput,
  LayoutDescriptor,
  LayoutSlotKey,
  LayoutRegion,
  LayoutGuide,
  LayoutVersionedRef,
  LayoutAssignmentBindingInput,
  LayoutAssignmentBinding,
  TemplateLayoutCatalogInput,
  ParsedTemplateLayoutCatalog,
  TemplateLayoutCatalog,
  ResolvedTemplateLayout,
  LayoutContractErrorCode,
} from "./layouts/LayoutDescriptor.types";
