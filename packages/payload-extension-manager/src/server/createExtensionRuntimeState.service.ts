/**
 * @file packages/payload-extension-manager/src/server/createExtensionRuntimeState.service.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Связывает доверенный compiled каталог и начальные назначения host без writes.
 * @see documentation/specifications/extension-management.md
 */
import { assertExtensionAssignmentReady } from "../catalog/assertExtensionAssignmentReady.validator";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import type { ResolvedExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import {
  createExtensionCatalog,
  createExtensionAppearanceStore,
  resolveExtensionAssignment,
} from "../appearance/extensionAppearance.server.index";

/** Runtime build identity получена host reader, а не параметром пользовательского запроса. */
export async function createExtensionRuntimeState(
  options: ResolvedExtensionManagerOptions,
) {
  const catalog = createExtensionCatalog({
    entries: options.catalog,
    hostCompatibility: options.hostCompatibility,
    runtimeBuildId: await options.runtimeBuildId?.(),
  });
  const assignment = (target: "admin" | "frontend") => {
    const configured =
      target === "admin" ? options.defaultAdmin : options.defaultFrontend;
    if (!configured) return null;
    const resolved = resolveExtensionAssignment({
      catalog,
      target,
      ...configured,
    });
    try {
      assertExtensionAssignmentReady(catalog, resolved.selection);
    } catch (error) {
      // Нерабочий default не исполняется и не блокирует каталог или replay уже применённого запроса.
      if (
        error instanceof ExtensionManagerError &&
        error.code === "TEMPLATE_PREVIEW_ONLY"
      )
        return null;
      throw error;
    }
    return resolved;
  };
  const bootstrapStore = createExtensionAppearanceStore({
    admin: assignment("admin"),
    frontend: assignment("frontend"),
  });
  return { catalog, bootstrapStore };
}
