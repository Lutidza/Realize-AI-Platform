/**
 * @file src/app/(system-admin)/system/appearance/preview/[planId]/error.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Показывает безопасный отказ чтения preview без выдачи server error в интерфейс.
 * @see documentation/specifications/extension-management.md
 */
"use client";
import { ExtensionAppearancePreviewStatus } from "@/components/admin/extensions/ExtensionAppearancePreviewStatus.component";

/** Данные ошибки остаются у Next; UI предлагает вернуться к актуальному каталогу. */
export default function AppearancePreviewError() {
  return (
    <ExtensionAppearancePreviewStatus
      mode="light"
      status="error"
      message="Не удалось открыть предпросмотр. Вернитесь к назначениям, обновите статус и повторите попытку."
    />
  );
}
