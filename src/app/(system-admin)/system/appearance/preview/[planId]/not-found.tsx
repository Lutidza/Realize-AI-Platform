/**
 * @file src/app/(system-admin)/system/appearance/preview/[planId]/not-found.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Сохраняет самостоятельный template status при неизвестном preview адресе.
 */
"use client";
import { ExtensionAppearancePreviewStatus } from "@/components/admin/extensions/ExtensionAppearancePreviewStatus.component";

export default function AppearancePreviewNotFound() {
  return (
    <ExtensionAppearancePreviewStatus
      mode="light"
      status="not-found"
      message="Предпросмотр по этому адресу не найден. Откройте план на странице «Темы и шаблоны»."
    />
  );
}
