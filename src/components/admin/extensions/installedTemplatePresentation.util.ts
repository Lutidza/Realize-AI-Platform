/**
 * @file src/components/admin/extensions/installedTemplatePresentation.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Форматирует подтверждённые inventory статусы и безопасные причины недоступности действий.
 */
import type { InstalledTemplateEntryDto } from "@realize/payload-extension-manager/contracts";

export function installedTemplateAvailability(
  entry: InstalledTemplateEntryDto,
): string {
  return entry.availability === "available"
    ? "Доступен"
    : entry.availability === "disabled"
      ? "Отключён"
      : "Несовместим";
}
export function installedTemplateActionReason(
  reason: InstalledTemplateEntryDto["actions"]["reason"],
): string | null {
  switch (reason) {
    case "read_only":
      return "Изменение доступно пользователю с соответствующими правами.";
    case "requires_schema":
      return "Сохранение станет доступно после подготовки платформы администратором системы.";
    case "runtime_unverified":
      return "Изменение станет доступно после подтверждения версии работающей платформы.";
    case "unavailable":
      return "Этот вариант пока недоступен для назначения.";
    default:
      return null;
  }
}
