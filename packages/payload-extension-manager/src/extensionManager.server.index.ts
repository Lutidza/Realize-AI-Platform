/**
 * @file packages/payload-extension-manager/src/extensionManager.server.index.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Экспортирует server facade без собственного release executor и без frontend Node imports.
 * @see documentation/specifications/extension-management.md
 */
export { ExtensionManagerService } from "./server/ExtensionManager.service";
export { InstalledTemplatesService } from "./server/InstalledTemplates.service";
export { AdminShellService } from "./server/AdminShell.service";
export { readAdminShellRuntime } from "./server/readAdminShellRuntime.service";
export { createAdminShellStore } from "./admin-shell/createAdminShellStore.util";
export { parseAdminShellStore } from "./admin-shell/parseAdminShellStore.validator";
export { parseAdminShellPolicy } from "./admin-shell/parseAdminShellPolicy.validator";
export { hashAdminShellPolicy } from "./admin-shell/hashAdminShellPolicy.server";
export { captureAdminShellTemplate } from "./admin-shell/captureAdminShellTemplate.validator";
export { assertAdminShellPlanCurrent } from "./admin-shell/assertAdminShellPlanCurrent.validator";
export { prepareAdminShell } from "./admin-shell/prepareAdminShell.service";
export { previewAdminShell } from "./admin-shell/previewAdminShell.service";
export { applyAdminShell } from "./admin-shell/applyAdminShell.service";
export { readAdminShellState } from "./admin-shell/readAdminShellState.service";
export { readExtensionRuntimeAssignment } from "./server/readExtensionRuntimeAssignment.service";
export { ExtensionAppearanceRepository } from "./persistence/ExtensionAppearance.repository";
export { ExtensionStateRepository } from "./persistence/ExtensionState.repository";
export { extensionAppearanceStateCodec } from "./persistence/extensionAppearanceStateCodec.validator";
export type {
  LedgerIdentity,
  ExtensionStateCodec,
  ExtensionStateDependency,
  ExtensionStateDependencies,
  ExtensionDependencyStores,
  ExtensionStateMutation,
  ExtensionStateStorageSnapshot,
} from "./persistence/ExtensionStatePersistence.types";
export { ExtensionAppearanceStorageError } from "./persistence/ExtensionAppearanceStorage.error";
export { createExtensionManagerCollections } from "./extensionManagerCollections.config";
export { resolveExtensionManagerOptions } from "./extensionManagerOptions.config";
export { createExtensionCatalog } from "./catalog/createExtensionCatalog.service";
export { resolveExtensionAssignment } from "./catalog/resolveExtensionAssignment.validator";
export { createExtensionAppearanceStore } from "./appearance/createExtensionAppearanceStore.util";
export { prepareExtensionAppearance } from "./appearance/prepareExtensionAppearance.service";
export { previewExtensionAppearance } from "./appearance/previewExtensionAppearance.service";
export { applyExtensionAppearance } from "./appearance/applyExtensionAppearance.service";
export type { ExtensionManagerOptions } from "./ExtensionManagerOptions.types";
export type { ExtensionRuntimeAssignment } from "./server/ExtensionRuntimeAssignment.types";
