/**
 * @file packages/payload-extension-manager/src/admin-shell/parseAdminShellPolicy.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет trusted host policy без getters, URL origins или execution code.
 * @see documentation/specifications/extension-management.md
 */
import { isTemplateSettings } from "@realize/template-contracts";
import type { AdminShellPolicy } from "./AdminShell.types";
import { adminShellPolicySchema } from "./adminShell.schemas";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";

export function parseAdminShellPolicy(input: unknown): AdminShellPolicy {
  if (!isTemplateSettings(input))
    throw new ExtensionManagerError("INVALID_POLICY");
  const parsed = adminShellPolicySchema.safeParse(input);
  if (!parsed.success) throw new ExtensionManagerError("INVALID_POLICY");
  return structuredClone(parsed.data);
}
