/**
 * @file src/components/admin/system-shell/resolveSystemAdminFallbackAppearance.validator.ts
 * @version 1.0.0
 * @date 2026-11-13
 * @description Проверяет fallback оформления против compiled registry, не обращаясь к БД.
 * @see documentation/architecture/system-admin-shell.md
 */
import {
  isTemplateSettings,
  parseTemplateManifest,
  resolveTemplateSelection,
} from "@realize/template-contracts";
import type {
  ResolveSystemAdminFallbackAppearanceInput,
  SystemAdminFallbackAppearanceResult,
} from "./SystemAdminFallbackAppearance.types";

/** Source не обходит admission; recovery явно задан host, случайный пакет из каталога не выбирается. */
export function resolveSystemAdminFallbackAppearance(
  input: ResolveSystemAdminFallbackAppearanceInput,
): SystemAdminFallbackAppearanceResult {
  const entries = input.entries.map((entry) => ({
    ...entry,
    manifest: parseTemplateManifest(entry.manifest),
  }));
  const candidates = input.reference
    ? [input.recovery]
    : [input.source, input.recovery];
  for (const [index, candidate] of candidates.entries()) {
    try {
      const resolved = resolveTemplateSelection({
        manifests: entries.map((entry) => entry.manifest),
        host: input.host,
        selection: candidate.selection,
      });
      if (resolved.selection.target !== "admin") continue;
      const entry = entries.find(
        (item) =>
          item.manifest.id === resolved.manifest.id &&
          item.manifest.version === resolved.manifest.version,
      );
      if (
        !entry ||
        ![undefined, "ready", "preview-only"].includes(entry.readiness)
      )
        continue;
      if (!input.reference && entry.readiness === "preview-only") continue;
      const settings = entry.resolveSettings(
        structuredClone(candidate.settings),
      );
      if (!isTemplateSettings(settings)) continue;
      return {
        selection: { ...resolved.selection, target: "admin" },
        settings: structuredClone(settings),
        requiresRecovery: !input.reference && index > 0,
      };
    } catch {
      // Ошибка source не превращает непроверенный pointer в props renderer.
    }
  }
  throw new Error("ADMIN_APPEARANCE_UNAVAILABLE");
}
