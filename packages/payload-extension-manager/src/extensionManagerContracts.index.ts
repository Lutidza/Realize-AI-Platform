/**
 * @file packages/payload-extension-manager/src/extensionManagerContracts.index.ts
 * @version 1.3.0
 * @date 2026-11-18
 * @description Экспортирует browser-safe contracts/schemas/maps без Node, React, Payload и AI.
 * @see documentation/specifications/extension-management.md
 */
export type {
  InstalledTemplateRuntimeReceipt,
  InstalledTemplateRuntimeEvidence,
  InstalledTemplateRuntimeDto,
  InstalledTemplatePaletteDto,
  InstalledTemplateActionReason,
  InstalledTemplateActionsDto,
  InstalledTemplateUsageDto,
  InstalledTemplateEntryDto,
  InstalledTemplateUnavailableAssignmentDto,
  InstalledTemplatesSnapshotDto,
  InstalledTemplatesLoaderContext,
} from "./installed-templates/InstalledTemplates.types";
export {
  installedTemplateRuntimeReceiptSchema,
  installedTemplateRuntimeEvidenceSchema,
  installedTemplateRuntimeSchema,
  installedTemplateEntrySchema,
  installedTemplateUnavailableAssignmentSchema,
  installedTemplatesSnapshotSchema,
} from "./installed-templates/installedTemplates.schemas";
export { mapInstalledTemplateRuntime } from "./installed-templates/mapInstalledTemplateRuntime.mapper";
export { mapInstalledTemplatesSnapshot } from "./installed-templates/mapInstalledTemplatesSnapshot.mapper";
export type {
  AdminShellMode,
  AdminShellPolicy,
  AdminShellState,
  AdminShellTemplateBinding,
  PrepareAdminShellInput,
  ApplyAdminShellInput,
  AdminShellPlan,
  AdminShellPlanDto,
  AdminShellReceiptDto,
  AdminShellPrepareReceipt,
  AdminShellApplyReceipt,
  AdminShellReceipt,
  AdminShellStore,
  AdminShellSnapshotDto,
  AdminShellPrepareResponseDto,
  AdminShellApplyResponseDto,
  PrepareAdminShellResult,
  ApplyAdminShellResult,
  AdminShellAppearance,
  AdminShellOperationContext,
  PrepareAdminShellOperation,
  PreviewAdminShellOperation,
  ApplyAdminShellOperation,
  AssertAdminShellPlanInput,
  ReadAdminShellStateInput,
  ReadAdminShellStateResult,
} from "./admin-shell/AdminShell.types";
export {
  adminShellModeSchema,
  adminShellPolicySchema,
  adminShellStateSchema,
  adminShellTemplateBindingSchema,
  prepareAdminShellSchema,
  applyAdminShellSchema,
  adminShellPlanSchema,
  adminShellPlanDtoSchema,
  adminShellReceiptDtoSchema,
  adminShellReceiptSchema,
  adminShellStoreSchema,
  adminShellSnapshotSchema,
  adminShellPrepareResponseSchema,
  adminShellApplyResponseSchema,
} from "./admin-shell/adminShell.schemas";
export { mapAdminShellPlan } from "./admin-shell/mapAdminShellPlan.mapper";
export { mapAdminShellReceipt } from "./admin-shell/mapAdminShellReceipt.mapper";
export type {
  ExtensionManagerSnapshotDto,
  ExtensionPrepareResponseDto,
  ExtensionApplyResponseDto,
  ExtensionHttpErrorCode,
} from "./ExtensionManager.types";
export type {
  ExtensionTemplateReadiness,
  ExtensionCatalogRegistration,
  ExtensionCatalogEntry,
  ExtensionCatalog,
  ExtensionCatalogEntryDto,
  ExtensionCatalogDto,
  CreateExtensionCatalogInput,
  ResolveExtensionAssignmentInput,
} from "./catalog/ExtensionCatalog.types";
export type {
  ExtensionAssignment,
  ExtensionLayoutAssignmentWritePolicy,
  ExtensionTargetState,
  PrepareExtensionAppearanceInput,
  ApplyExtensionAppearanceInput,
  ExtensionAppearancePlan,
  ExtensionAppearancePlanDto,
  ExtensionAppearanceReceiptDto,
  ExtensionPrepareReceipt,
  ExtensionApplyReceipt,
  ExtensionAppearanceReceipt,
  ExtensionAppearanceStore,
  PrepareExtensionAppearanceResult,
  ApplyExtensionAppearanceResult,
  CreateExtensionAppearanceStoreInput,
  ExtensionOperationContext,
  PrepareExtensionAppearanceOperation,
  PreviewExtensionAppearanceOperation,
  ApplyExtensionAppearanceOperation,
  AssertExtensionPlanCurrentInput,
  ExtensionManagerErrorCode,
} from "./appearance/ExtensionAppearance.types";
export { ExtensionManagerError } from "./appearance/ExtensionManager.error";
export { EXTENSION_APPEARANCE_LIMITS } from "./appearance/extensionAppearance.constants";
export {
  extensionHashSchema,
  extensionActorKeySchema,
  extensionRequestIdSchema,
  extensionSettingsSchema,
  extensionAssignmentSchema,
  extensionTargetStateSchema,
  prepareExtensionAppearanceSchema,
  applyExtensionAppearanceSchema,
  extensionAppearancePlanSchema,
  extensionAppearanceReceiptSchema,
  extensionAppearanceStoreSchema,
  extensionAppearancePlanDtoSchema,
  extensionAppearanceReceiptDtoSchema,
} from "./appearance/extensionAppearance.schemas";
export { extensionCatalogDtoSchema } from "./catalog/extensionCatalog.schemas";
export { mapExtensionCatalog } from "./catalog/mapExtensionCatalog.mapper";
export { mapExtensionAppearancePlan } from "./appearance/mapExtensionAppearancePlan.mapper";
export { mapExtensionAppearanceReceipt } from "./appearance/mapExtensionAppearanceReceipt.mapper";
