/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationCleanupDialog.component.tsx
 * @version 1.1.0
 * @date 2026-09-30
 * @description Подтверждает рассчитанную сервером очистку с сохранением новых событий и возвратом фокуса.
 */
"use client";
import { useTheme } from "@payloadcms/ui";
import { UiConfirmation } from "@realize/ui-kit";
import type { SearchObservationCleanupDialogProps } from "./SearchObservationManagement.types";

export function SearchObservationCleanupDialog({
  preview,
  pending,
  error,
  triggerRef,
  onConfirm,
  onClose,
}: SearchObservationCleanupDialogProps) {
  const { theme } = useTheme();
  return (
    <UiConfirmation
      open={Boolean(preview)}
      mode={theme}
      title={
        preview?.mode === "expired"
          ? "Удалить устаревшие записи?"
          : "Очистить историю поиска?"
      }
      subject={`Сохранённых записей к удалению: ${preview?.count.toLocaleString("ru-RU") ?? "—"}`}
      description={
        preview
          ? `Период до ${new Date(preview.before).toLocaleString("ru-RU")} по времени события. ${preview.mode === "history" ? "Дневные агрегаты и контрольные замеры до этой даты также будут удалены. " : ""}Удаление необратимо; поздняя доставка этого периода будет пропущена. Новые события после указанного времени сохранятся.`
          : undefined
      }
      tone="danger"
      confirmLabel="Подтвердить очистку"
      pending={pending}
      error={error ?? undefined}
      onConfirm={onConfirm}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        triggerRef.current?.focus();
      }}
    />
  );
}
