/**
 * @file src/components/admin/access-tokens/useAccessSecret.hook.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Копирует однократный секрет в clipboard без persistence и отражения ошибок браузера.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { useState } from "react";

export function useAccessSecret(secret?: string) {
  const [notice, setNotice] = useState<string | null>(null);
  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setNotice("Токен скопирован. Сохраните его в защищённом хранилище.");
    } catch {
      setNotice("Clipboard недоступен. Выделите токен и скопируйте вручную.");
    }
  };
  return { notice, copy };
}
