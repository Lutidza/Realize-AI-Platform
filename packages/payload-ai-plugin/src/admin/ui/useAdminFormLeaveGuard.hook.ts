/**
 * @file packages/payload-ai-plugin/src/admin/ui/useAdminFormLeaveGuard.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Защищает черновик независимой формы Admin при переходах и закрытии вкладки.
 */

"use client";

import { useEffect } from "react";

/** Внутренний переход блокируется до явного разрешения формы; закрытие вкладки предупреждает браузер. */
export const useAdminFormLeaveGuard = (locked: boolean) => {
  useEffect(() => {
    if (!locked) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: NavigateEvent) => {
      if (
        event.navigationType === "traverse" &&
        event.destination.sameDocument &&
        event.cancelable &&
        !event.hashChange
      )
        event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self") ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search
      )
        return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.navigation?.addEventListener("navigate", navigate);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.navigation?.removeEventListener("navigate", navigate);
      document.removeEventListener("click", click, true);
    };
  }, [locked]);
};
