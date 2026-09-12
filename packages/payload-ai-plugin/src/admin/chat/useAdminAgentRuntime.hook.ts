/**
 * @file packages/payload-ai-plugin/src/admin/chat/useAdminAgentRuntime.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Обновляет доступность агента после сохранения интеграции и возвращения в чат.
 */

"use client";

import type { RuntimeStatusDTO } from "@realize/ai-contracts";
import { useEffect, useState } from "react";
import { CHAT_SETTINGS_UPDATED_EVENT } from "../chat-presentation/chatPresentation.constants";
import { requestRealizeAI } from "../realizeAIAPI";

/** Проверка статуса не перезагружает историю; поздний ответ не отменяет новое состояние переключателя. */
export const useAdminAgentRuntime = (enabled: boolean) => {
  const [runtime, setRuntime] = useState<RuntimeStatusDTO>();
  useEffect(() => {
    if (!enabled) return;
    let current: AbortController | undefined;
    const refresh = () => {
      current?.abort();
      const request = new AbortController();
      current = request;
      void requestRealizeAI<RuntimeStatusDTO>("/status", {
        cache: "no-store",
        signal: request.signal,
      })
        .then((status) => {
          if (!request.signal.aborted && current === request)
            setRuntime(status);
        })
        .catch(() => {
          if (!request.signal.aborted && current === request)
            setRuntime(undefined);
        });
    };
    const invalidate = () => {
      setRuntime(undefined);
      refresh();
    };
    refresh();
    window.addEventListener("focus", invalidate);
    window.addEventListener(CHAT_SETTINGS_UPDATED_EVENT, invalidate);
    return () => {
      current?.abort();
      window.removeEventListener("focus", invalidate);
      window.removeEventListener(CHAT_SETTINGS_UPDATED_EVENT, invalidate);
    };
  }, [enabled]);
  return runtime;
};
