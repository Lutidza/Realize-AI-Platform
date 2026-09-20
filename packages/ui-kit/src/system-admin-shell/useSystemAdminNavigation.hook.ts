/**
 * @file packages/ui-kit/src/system-admin-shell/useSystemAdminNavigation.hook.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Согласует мобильную навигацию с viewport и не монтирует две копии раздела.
 */

"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const query = "(max-width: 900px)";
const getSnapshot = () => window.matchMedia(query).matches;
const getServerSnapshot = () => false;

export function useSystemAdminNavigation() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(query);
    const onMediaChange = () => {
      setNavigationOpen(false);
      onChange();
    };
    media.addEventListener("change", onMediaChange);
    return () => media.removeEventListener("change", onMediaChange);
  }, []);
  const isMobile = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { isMobile, navigationOpen, setNavigationOpen };
}
