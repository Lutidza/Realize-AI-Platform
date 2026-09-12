/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexIntegrationTab.hook.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Сохраняет выбранную вкладку Codex в адресе без перезагрузки формы.
 */

"use client";

import { useSyncExternalStore } from "react";

const readTab = () => {
  const value = window.location.hash.slice(1);
  return value === "agent" || value === "chat" || value === "tools"
    ? value
    : "connection";
};
const subscribe = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};

export const useCodexIntegrationTab = () => {
  const tab = useSyncExternalStore(subscribe, readTab, () => "connection");
  const setTab = (value: string) => {
    if (!["connection", "agent", "chat", "tools"].includes(value)) return;
    const url = new URL(window.location.href);
    url.hash = value;
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event("hashchange"));
  };
  return { tab, setTab };
};
