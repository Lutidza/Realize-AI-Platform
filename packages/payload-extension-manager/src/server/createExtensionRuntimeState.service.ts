/**
 * @file packages/payload-extension-manager/src/server/createExtensionRuntimeState.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Связывает доверенный compiled каталог и начальные назначения host без writes.
 * @see documentation/specifications/extension-management.md
 */
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
    return configured
      ? resolveExtensionAssignment({ catalog, target, ...configured })
      : null;
  };
  const bootstrapStore = createExtensionAppearanceStore({
    admin: assignment("admin"),
    frontend: assignment("frontend"),
  });
  return { catalog, bootstrapStore };
}
