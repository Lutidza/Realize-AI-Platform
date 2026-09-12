/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerDeepLink.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Загружает исторический выпуск по ссылке после проверки незавершённых изменений.
 */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation.js";
import { parseAgentLayerDeepLink } from "./parseAgentLayerDeepLink.validator";
import type { AgentLayerDeepLinkOptions } from "./AgentLayerDeepLink.types";

/** Не выполняет запись, активацию или автоматический отказ от редактируемого черновика. */
export const useAgentLayerDeepLink = ({
  ready,
  busy,
  dirty,
  pending,
  openRelease,
}: AgentLayerDeepLinkOptions) => {
  const identity = useSearchParams().toString();
  const parsed = useMemo(() => {
    try {
      return {
        target: parseAgentLayerDeepLink(new URLSearchParams(identity)),
        error: undefined,
      };
    } catch (error) {
      return { target: undefined, error: (error as Error).message };
    }
  }, [identity]);
  const [failure, setFailure] = useState<{
    attempt: string;
    message: string;
  }>();
  const [revision, setRevision] = useState(0);
  const [settlement, setSettlement] = useState(0);
  const attempted = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const attempt = `${identity}:${revision}`;
  const blocked = Boolean(parsed.target && (dirty || pending));
  useEffect(() => {
    if (
      !ready ||
      busy ||
      blocked ||
      inFlight.current ||
      attempted.current === attempt ||
      !parsed.target
    )
      return;
    const target = parsed.target;
    attempted.current = attempt;
    inFlight.current = true;
    void openRelease(target.releaseID, target.artifact)
      .then((opened) => {
        setFailure(
          opened
            ? undefined
            : {
                attempt,
                message:
                  "Не удалось открыть указанный выпуск. Проверьте доступ и повторите загрузку.",
              },
        );
      })
      .catch(() => {
        setFailure({
          attempt,
          message: "Не удалось открыть указанный выпуск. Повторите загрузку.",
        });
      })
      .finally(() => {
        inFlight.current = false;
        // После завершения чтения проверяется ссылка, которая могла измениться во время запроса.
        setSettlement((value) => value + 1);
      });
  }, [attempt, ready, busy, blocked, openRelease, parsed, settlement]);
  return {
    error:
      parsed.error ??
      (blocked
        ? "Завершите сохранение или повтор текущей операции. Выпуск по ссылке откроется после этого; ваши изменения остаются в форме."
        : failure?.attempt === attempt
          ? failure.message
          : undefined),
    retry: () => setRevision((value) => value + 1),
  };
};
