/**
 * @file packages/payload-ai-plugin/src/admin/chat/useChatPageDraftSelection.hook.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Читает выбранную ревизию страницы и хранит только подпись и fingerprint.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatPageDraftSelection } from "./ChatDraftContext.types";
import { loadChatPageDraft } from "./chatContextAPI.adapter";

/** Отмена и замена выбора исключают применение запоздавшего ответа после handoff. */
export const useChatPageDraftSelection = (
  onError: (message: string | undefined) => void,
) => {
  const [pageDraft, setPageDraft] = useState<ChatPageDraftSelection>();
  const [isSelectingPageDraft, setSelecting] = useState(false);
  const requestRef = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => requestRef.current?.abort(), []);
  const restorePageDraft = useCallback((selection?: ChatPageDraftSelection) => {
    requestRef.current?.abort();
    requestRef.current = undefined;
    setSelecting(false);
    setPageDraft(selection);
  }, []);
  const selectPageDraft = useCallback(
    async (id: string) => {
      requestRef.current?.abort();
      const request = new AbortController();
      requestRef.current = request;
      setSelecting(true);
      onError(undefined);
      try {
        const snapshot = await loadChatPageDraft(id, request.signal);
        if (!request.signal.aborted && requestRef.current === request) {
          setPageDraft({ ...snapshot.page, fingerprint: snapshot.fingerprint });
        }
      } catch (cause) {
        if (!request.signal.aborted && requestRef.current === request)
          onError(
            cause instanceof Error
              ? cause.message
              : "Не удалось прочитать страницу. Выберите её снова.",
          );
      } finally {
        if (!request.signal.aborted && requestRef.current === request) {
          requestRef.current = undefined;
          setSelecting(false);
        }
      }
    },
    [onError],
  );
  const clearSentPageDraft = useCallback((sent?: ChatPageDraftSelection) => {
    setPageDraft((current) =>
      current?.id === sent?.id && current?.fingerprint === sent?.fingerprint
        ? undefined
        : current,
    );
  }, []);
  return {
    pageDraft,
    isSelectingPageDraft,
    selectPageDraft,
    restorePageDraft,
    clearSentPageDraft,
  };
};
