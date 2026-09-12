/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerLeaveGuard.hook.ts
 * @version 1.0.1
 * @date 2026-09-10
 * @description Защищает несохранённую запись при переходах, закрытии или перезагрузке вкладки.
 */

"use client";

import { useEffect } from "react";

export const useAgentLayerLeaveGuard = (hasUnsavedChanges: boolean) => {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Переход Back/Forward внутри документа не вызывает click или beforeunload.
    const onHistoryNavigation = (event: NavigateEvent) => {
      if (
        event.navigationType !== "traverse" ||
        !event.destination.sameDocument ||
        !event.cancelable ||
        event.hashChange
      )
        return;
      if (
        !window.confirm(
          "Есть несохранённые изменения или неподтверждённая запись. Покинуть настройки агентского слоя?",
        )
      )
        event.preventDefault();
    };
    // Штатный LeaveWithoutSaving привязан к Payload Form; независимая форма использует такой же захват ссылок.
    const onLinkClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest("a[href]") : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        !["http:", "https:"].includes(destination.protocol) ||
        (destination.origin === current.origin &&
          destination.pathname === current.pathname &&
          destination.search === current.search)
      )
        return;
      if (
        !window.confirm(
          "Есть несохранённые изменения или неподтверждённая запись. Покинуть настройки агентского слоя?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.navigation?.addEventListener("navigate", onHistoryNavigation);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.navigation?.removeEventListener("navigate", onHistoryNavigation);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [hasUnsavedChanges]);
};
