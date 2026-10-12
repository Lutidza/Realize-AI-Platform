/**
 * @file src/components/admin/system-shell/systemAdminReferenceAppearance.config.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Фиксирует эталонный пакет и настройки независимо от рабочего Admin выбора.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { AdminAppearanceConfig } from "./adminAppearance.types";

/** Эталон меняется только при отдельном пересмотре reference baseline. */
export const systemAdminReferenceAppearance: Pick<
  AdminAppearanceConfig,
  "selection" | "settings"
> = {
  selection: {
    templateId: "realize",
    templateVersion: "0.1.0",
    target: "admin",
    paletteId: "realize",
    paletteVersion: "0.1.0",
    mode: "light",
  },
  settings: { density: "comfortable", panelWidth: 280 },
};
