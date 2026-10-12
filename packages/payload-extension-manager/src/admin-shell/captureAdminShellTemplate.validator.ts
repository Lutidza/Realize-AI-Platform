/**
 * @file packages/payload-extension-manager/src/admin-shell/captureAdminShellTemplate.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Фиксирует exact Admin assignment и readonly CAS/catalog guard для custom оболочки.
 * @see documentation/specifications/extension-management.md
 */
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import { parseExtensionAppearanceStore } from "../appearance/parseExtensionAppearanceStore.validator";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";
import { resolveExtensionAssignment } from "../catalog/resolveExtensionAssignment.validator";
import type {
  AdminShellAppearance,
  AdminShellTemplateBinding,
} from "./AdminShell.types";

/** Native операции не вызывают эту проверку и не зависят от исправности custom assignment. */
export function captureAdminShellTemplate(
  appearance: AdminShellAppearance | null,
): AdminShellTemplateBinding {
  if (!appearance) throw new ExtensionManagerError("SHELL_UNAVAILABLE");
  const store = parseExtensionAppearanceStore(appearance.store);
  const state = store.targets.admin;
  if (!state.current) throw new ExtensionManagerError("SHELL_UNAVAILABLE");
  let assignment;
  try {
    assignment = resolveExtensionAssignment({
      catalog: appearance.catalog,
      target: "admin",
      selection: state.current.selection,
      settings: state.current.settings,
    });
    if (hashExtensionValue(assignment) !== hashExtensionValue(state.current))
      throw new ExtensionManagerError("SHELL_UNAVAILABLE");
  } catch {
    throw new ExtensionManagerError("SHELL_UNAVAILABLE");
  }
  return {
    appearanceRevision: state.revision,
    appearanceHash: hashExtensionValue({ target: "admin", state }),
    catalogHash: appearance.catalog.catalogHash,
    assignment,
  };
}
