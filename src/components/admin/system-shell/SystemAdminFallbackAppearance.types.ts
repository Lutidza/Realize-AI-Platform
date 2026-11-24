/**
 * @file src/components/admin/system-shell/SystemAdminFallbackAppearance.types.ts
 * @version 1.0.0
 * @date 2026-11-13
 * @description Определяет вход чистой проверки source и recovery оформления Admin.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { ExtensionCatalogRegistration } from "@realize/payload-extension-manager/contracts";
import type { TemplateHostCompatibility } from "@realize/template-contracts";
import type { AdminAppearanceConfig } from "./adminAppearance.types";

export type SystemAdminFallbackAppearance = Pick<
  AdminAppearanceConfig,
  "selection" | "settings"
>;
/** Reference — явный preview-контекст, не путь рабочей активации. */
export type ResolveSystemAdminFallbackAppearanceInput = {
  entries: readonly ExtensionCatalogRegistration[];
  host: TemplateHostCompatibility;
  source: SystemAdminFallbackAppearance;
  recovery: SystemAdminFallbackAppearance;
  reference: boolean;
};
export type SystemAdminFallbackAppearanceResult =
  SystemAdminFallbackAppearance & {
    requiresRecovery: boolean;
  };
