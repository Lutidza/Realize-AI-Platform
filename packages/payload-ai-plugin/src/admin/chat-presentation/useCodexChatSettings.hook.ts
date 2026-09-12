/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/useCodexChatSettings.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Обновляет безопасные настройки чата при сохранении и возвращении фокуса.
 */

"use client";

import {
  parseCodexChatSettings,
  type CodexChatSettingsDto,
} from "@realize/ai-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { requestRealizeAI } from "../realizeAIAPI";
import { CHAT_SETTINGS_UPDATED_EVENT } from "./chatPresentation.constants";

/** Запоздавший ответ и размонтированный provider не меняют актуальное состояние. */
export const useCodexChatSettings = () => {
  const [settings, setSettings] = useState<CodexChatSettingsDto>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestRef = useRef<AbortController | null>(null);
  const refreshSettings = useCallback(async () => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setIsLoading(true);
    try {
      const next = parseCodexChatSettings(
        await requestRealizeAI<unknown>("/chat/settings", {
          signal: request.signal,
        }),
      );
      if (request.signal.aborted || requestRef.current !== request) return;
      setSettings(next);
      setError(undefined);
    } catch (cause) {
      if (request.signal.aborted || requestRef.current !== request) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить настройки чата.",
      );
    } finally {
      if (!request.signal.aborted && requestRef.current === request)
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => void refreshSettings();
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(CHAT_SETTINGS_UPDATED_EVENT, refresh);
    return () => {
      requestRef.current?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CHAT_SETTINGS_UPDATED_EVENT, refresh);
    };
  }, [refreshSettings]);
  return { settings, isLoading, error, refreshSettings };
};
