/**
 * @file packages/payload-ai-plugin/src/admin/chat/useChatAgentConfiguration.hook.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Загружает активные профили и сохраняет точный выбор при обновлении каталога.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AIChatConfigurationCatalogDTO,
  AIChatConfigurationSelection,
} from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";
import type { ChatAgentConfigurationController } from "./ChatAgentConfiguration.types";
import { CHAT_AGENT_CONFIGURATION_UPDATED_EVENT } from "./chatAgentConfiguration.constants";

/** Поздний ответ не меняет каталог; недоступный выбор не заменяется другим профилем. */
export const useChatAgentConfiguration = (
  enabled: boolean,
): ChatAgentConfigurationController => {
  const [catalog, setCatalog] = useState<AIChatConfigurationCatalogDTO>();
  const [selection, setSelection] = useState<AIChatConfigurationSelection>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestRef = useRef<AbortController | null>(null);
  const selectionTouched = useRef(false);
  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setIsLoading(true);
    try {
      const next = await requestRealizeAI<AIChatConfigurationCatalogDTO>(
        "/config/runtime",
        {
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(15_000),
          ]),
          cache: "no-store",
        },
      );
      if (request.signal.aborted || requestRef.current !== request) return;
      setCatalog(next);
      setError(undefined);
      if (
        !selectionTouched.current &&
        next.release &&
        next.profiles.length === 1
      ) {
        const release = next.release;
        setSelection(
          (current) =>
            current ?? {
              releaseID: release.id,
              manifestHash: release.manifestHash,
              profileKey: next.profiles[0]!.key,
            },
        );
      }
    } catch (cause) {
      if (request.signal.aborted || requestRef.current !== request) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить профили агентов.",
      );
    } finally {
      if (!request.signal.aborted && requestRef.current === request)
        setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const reload = () => void refresh();
    reload();
    window.addEventListener("focus", reload);
    window.addEventListener(CHAT_AGENT_CONFIGURATION_UPDATED_EVENT, reload);
    return () => {
      requestRef.current?.abort();
      window.removeEventListener("focus", reload);
      window.removeEventListener(
        CHAT_AGENT_CONFIGURATION_UPDATED_EVENT,
        reload,
      );
    };
  }, [enabled, refresh]);
  const restoreSelection = useCallback(
    (next?: AIChatConfigurationSelection) => {
      selectionTouched.current = true;
      setSelection(next ? { ...next } : undefined);
    },
    [],
  );
  const selectProfile = (key: string) => {
    if (isLoading || error || !catalog) return;
    if (!catalog.release && !key) return restoreSelection(undefined);
    if (
      !catalog.release ||
      !catalog.profiles.some((profile) => profile.key === key)
    )
      return;
    restoreSelection({
      releaseID: catalog.release.id,
      manifestHash: catalog.release.manifestHash,
      profileKey: key,
    });
  };
  const matches = Boolean(
    catalog &&
    (catalog.release
      ? selection &&
        selection.releaseID === catalog.release.id &&
        selection.manifestHash === catalog.release.manifestHash &&
        catalog.profiles.some((profile) => profile.key === selection.profileKey)
      : !selection),
  );
  return {
    catalog,
    selection,
    isLoading,
    isReady: !isLoading && !error && matches,
    error,
    refresh,
    selectProfile,
    restoreSelection,
  };
};
