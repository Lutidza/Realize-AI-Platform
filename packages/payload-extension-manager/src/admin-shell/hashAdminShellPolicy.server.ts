/**
 * @file packages/payload-extension-manager/src/admin-shell/hashAdminShellPolicy.server.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Связывает планы с проверенными host routes, доступностью и native vendor metadata.
 * @see documentation/specifications/extension-management.md
 */
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";
import { parseAdminShellPolicy } from "./parseAdminShellPolicy.validator";

export function hashAdminShellPolicy(policy: unknown): string {
  return hashExtensionValue(parseAdminShellPolicy(policy));
}
