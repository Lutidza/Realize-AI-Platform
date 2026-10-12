/**
 * @file packages/payload-extension-manager/src/server/resolveAdminShellPolicy.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет статическую либо вычисленную host policy встроенных оболочек.
 * @see documentation/specifications/extension-management.md
 */
import type { ResolvedExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import { parseAdminShellPolicy } from "../admin-shell/parseAdminShellPolicy.validator";

/** Версия native приходит от trusted host reader, а не от HTTP input. */
export async function resolveAdminShellPolicy(
  options: ResolvedExtensionManagerOptions,
) {
  return parseAdminShellPolicy(
    typeof options.adminShell === "function"
      ? await options.adminShell()
      : options.adminShell,
  );
}
