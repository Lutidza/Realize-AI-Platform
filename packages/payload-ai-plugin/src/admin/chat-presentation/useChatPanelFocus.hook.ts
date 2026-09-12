/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/useChatPanelFocus.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Передаёт фокус немодальной панели и обрабатывает Escape только внутри неё.
 */

"use client";
import { useEffect, useRef, type KeyboardEvent } from "react";

export const useChatPanelFocus = (open: boolean, close: () => void) => {
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  return { panelRef, onKeyDown };
};
