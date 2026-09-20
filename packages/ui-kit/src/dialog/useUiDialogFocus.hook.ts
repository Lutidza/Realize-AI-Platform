/**
 * @file packages/ui-kit/src/dialog/useUiDialogFocus.hook.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Возвращает фокус открывшему диалог элементу, включая вложенные редакторы.
 */

"use client";

import { useRef, useState } from "react";
import type { UiDialogProps } from "./UiDialog.types";

export function useUiDialogFocus({
  onCloseAutoFocus,
  initialFocusRef,
}: Pick<UiDialogProps, "onCloseAutoFocus" | "initialFocusRef">) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Hook принадлежит монтируемому Content, поэтому snapshot предшествует input autoFocus.
  const [returnFocusTarget] = useState(() =>
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return {
    headingRef,
    onOpenAutoFocus: (event: Event) => {
      event.preventDefault();
      const initialTarget = initialFocusRef?.current;
      (initialTarget && !initialTarget.matches(":disabled")
        ? initialTarget
        : headingRef.current
      )?.focus({
        preventScroll: true,
      });
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      // Radix удаляет вложенные FocusScope после этого callback. Следующий frame
      // не даёт их cleanup снова сбросить фокус; новый открытый dialog имеет приоритет.
      requestAnimationFrame(() => {
        if (!returnFocusTarget?.isConnected) return;
        const dialogs = document.querySelectorAll<HTMLElement>(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        );
        const currentDialog = dialogs.item(dialogs.length - 1);
        if (currentDialog && !currentDialog.contains(returnFocusTarget)) return;
        returnFocusTarget.focus({ preventScroll: true });
      });
    },
  };
}
