/**
 * @file packages/payload-extension-manager/src/extensionManagerOptions.config.ts
 * @version 1.2.0
 * @date 2026-10-12
 * @description Проверяет статическую композицию host; input HTTP не меняет registry или realm.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ExtensionManagerOptions,
  ResolvedExtensionManagerOptions,
} from "./ExtensionManagerOptions.types";
import { parseAdminShellPolicy } from "./admin-shell/parseAdminShellPolicy.validator";

/** Ошибка bootstrap не содержит содержимого конфигурации или credentials. */
export function resolveExtensionManagerOptions(
  options: ExtensionManagerOptions,
): ResolvedExtensionManagerOptions {
  const apiRoute = options.apiRoute ?? "/realize-extensions";
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(options.userCollection) ||
    !/^[A-Za-z0-9:_-]{1,200}$/.test(options.scopeKey) ||
    !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(apiRoute) ||
    !Array.isArray(options.catalog) ||
    (options.runtimeBuildId !== undefined &&
      typeof options.runtimeBuildId !== "function") ||
    (options.runtimeInstallation !== undefined &&
      typeof options.runtimeInstallation !== "function") ||
    ![
      options.access?.canReadCatalog,
      options.access?.canManageAppearance,
      options.access?.canInstallCode,
    ].every((callback) => typeof callback === "function")
  )
    throw new Error("Некорректная host-конфигурация менеджера расширений.");
  if (options.adminShell && typeof options.adminShell !== "function")
    parseAdminShellPolicy(options.adminShell);
  return { ...options, apiRoute };
}
