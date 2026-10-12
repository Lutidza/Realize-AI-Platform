/**
 * @file src/components/admin/system-shell/adminAppearance.config.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Фиксирует первую встроенную точную пару template/palette системного Admin.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { AdminAppearanceConfig } from "./adminAppearance.types";

/** Bootstrap/fallback source config; сохранённое compiled назначение читает server host. */
export const adminAppearanceConfig: AdminAppearanceConfig = {
  selection: {
    templateId: "realize",
    templateVersion: "0.1.0",
    target: "admin",
    paletteId: "realize",
    paletteVersion: "0.1.0",
    mode: "light",
  },
  settings: {},
  host: {
    contractVersion: "1.0",
    platformVersion: "1.0.0",
    reactVersion: "19.2.8",
    nextVersion: "16.3.1",
  },
};
