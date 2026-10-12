/**
 * @file packages/template-realize/src/layouts/admin/useSystemAdminActionMenu.hook.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Передаёт фокус от меню общих действий следующему экрану или диалогу.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { useRef, useState } from "react";

export function useSystemAdminActionMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<(() => void) | null>(null);
  return {
    open,
    setOpen,
    triggerRef,
    select: (action: () => void) => {
      pending.current = action;
    },
    onCloseAutoFocus: (event: Event) => {
      const action = pending.current;
      pending.current = null;
      if (!action) return;
      event.preventDefault();
      // Radix должен завершить cleanup своего scope до открытия следующего dialog.
      requestAnimationFrame(() => {
        triggerRef.current?.focus({ preventScroll: true });
        action();
      });
    },
  };
}
