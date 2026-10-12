/**
 * @file src/components/admin/system-shell/adminAppearance.types.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Описывает bootstrap/fallback назначение и совместимость compiled Admin host.
 * @see documentation/architecture/system-admin-shell.md
 */

import type {
  TemplateHostCompatibility,
  TemplateSelection,
  TemplateSettings,
} from "@realize/template-contracts";

/** Frontend имеет самостоятельное назначение; этот host владеет только Admin. */
export type AdminTemplateSelection = TemplateSelection & { target: "admin" };

/** Source default используется до первого назначения; он не подтверждает доставку пакета. */
export type AdminAppearanceConfig = {
  selection: AdminTemplateSelection;
  settings: TemplateSettings;
  host: TemplateHostCompatibility;
};
