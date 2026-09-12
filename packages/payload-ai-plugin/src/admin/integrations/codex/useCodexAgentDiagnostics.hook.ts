/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexAgentDiagnostics.hook.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Обновляет диагностику видимой вкладки и heartbeat без пересечения запросов.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CodexAgentDiagnosticsOptions,
  CodexAgentDiagnosticsState,
} from "./CodexAgentDiagnostics.types";
import { codexIntegrationAPI } from "./codexIntegrationAPI.adapter";

/** Смена ревизии скрывает прежнюю готовность; фоновое чтение сохраняет снимок до ответа сервера. */
export const useCodexAgentDiagnostics = ({
  active,
  connection,
}: CodexAgentDiagnosticsOptions) => {
  const [state, setState] = useState<CodexAgentDiagnosticsState>();
  const [attempt, setAttempt] = useState(0);
  const sourceKey = JSON.stringify([connection?.id, connection?.revision]);
  const request = useMemo(
    () => ({ active, sourceKey, attempt }),
    [active, sourceKey, attempt],
  );
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active, refresh]);

  useEffect(() => {
    if (!request.active) return;
    let stopped = false;
    let controller: AbortController | undefined;
    let timer: number | undefined;
    let deadline: number | undefined;
    const pause = () => {
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
      controller?.abort();
      controller = undefined;
    };
    const read = async () => {
      if (stopped || document.hidden || controller) return;
      const current = new AbortController();
      controller = current;
      deadline = window.setTimeout(() => {
        if (stopped || controller !== current) return;
        current.abort();
        controller = undefined;
        setState({
          request,
          error:
            "Сервис не ответил вовремя. Актуальное состояние агента неизвестно.",
        });
        timer = window.setTimeout(() => void read(), 5_000);
      }, 10_000);
      try {
        const diagnostics = await codexIntegrationAPI.diagnostics(
          current.signal,
        );
        if (!stopped && !current.signal.aborted)
          setState({ request, diagnostics });
      } catch (cause) {
        if (!stopped && !current.signal.aborted)
          setState({
            request,
            error:
              cause instanceof Error
                ? cause.message
                : "Не удалось загрузить состояние агента.",
          });
      } finally {
        // Отменённый запрос не заменяет таймер уже возобновлённого чтения.
        if (controller === current) {
          window.clearTimeout(deadline);
          controller = undefined;
          if (!stopped && !document.hidden)
            timer = window.setTimeout(() => void read(), 5_000);
        }
      }
    };
    const onVisibilityChange = () => {
      pause();
      // После скрытия снимок мог устареть на часы; возврат требует нового подтверждения готовности.
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void read();
    return () => {
      stopped = true;
      pause();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [request, refresh]);

  return {
    diagnostics: state?.request === request ? state.diagnostics : undefined,
    error: state?.request === request ? state.error : undefined,
    isLoading: active && state?.request !== request,
    refresh,
  };
};
