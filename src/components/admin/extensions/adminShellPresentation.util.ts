/**
 * @file src/components/admin/extensions/adminShellPresentation.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Форматирует названия двух встроенных оболочек без выдуманных package/palette metadata.
 */
import type { AdminShellMode } from "@realize/payload-extension-manager/contracts";

export function adminShellLabel(mode: AdminShellMode): string {
  return mode === "native" ? "Стандартная Payload" : "Realize";
}
