/**
 * @file src/components/admin/media/reference/MediaReferenceWorkbench.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Публичный контракт демонстрационной медиатеки.
 * @see documentation/specifications/media-management-references.md
 */

/** Начальные настройки действуют только при создании сеанса; callback подключает host. */
export type MediaReferenceWorkbenchProps = {
  initialTheme?: "light" | "dark";
  initialScenario?: "normal" | "empty" | "loading" | "error" | "denied";
  onOpenWorkingMedia?: () => void;
};
