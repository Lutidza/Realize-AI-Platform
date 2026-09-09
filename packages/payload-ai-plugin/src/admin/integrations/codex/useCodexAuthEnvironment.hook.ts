/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexAuthEnvironment.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Загружает безопасный статус серверной идентификации для выбранного режима Codex.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { codexIntegrationAPI } from "./codexIntegrationAPI.adapter";
import type { CodexAuthEnvironmentState } from "./CodexAuthEnvironment.types";

export const useCodexAuthEnvironment = (isSelected: boolean) => {
  const [state, setState] = useState<CodexAuthEnvironmentState>();
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(
    () => ({ isSelected, attempt }),
    [isSelected, attempt],
  );

  useEffect(() => {
    if (!request.isSelected) return;
    const controller = new AbortController();
    void codexIntegrationAPI.environment(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setState({ request, environment: result });
      },
      () => {
        if (!controller.signal.aborted)
          setState({
            request,
            error:
              "Не удалось проверить настройки сервера. Повторите проверку.",
          });
      },
    );
    return () => controller.abort();
  }, [request]);

  return {
    environment: state?.request === request ? state.environment : undefined,
    error: state?.request === request ? state.error : undefined,
    isLoading: isSelected && state?.request !== request,
    reload: () => setAttempt((value) => value + 1),
  };
};
