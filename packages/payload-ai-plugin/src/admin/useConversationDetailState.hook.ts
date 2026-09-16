/**
 * @file packages/payload-ai-plugin/src/admin/useConversationDetailState.hook.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Согласует состояние выбранного диалога и snapshot ref одним синхронным dispatcher.
 * @see documentation/delivery/01-local-admin-ai.md
 */
"use client";

import type { ConversationDetailDTO } from "@realize/ai-contracts";
import { useCallback, useRef, useState, type SetStateAction } from "react";

/** Обработчики событий вычисляют updater один раз; повторный React render не меняет ref. */
export const useConversationDetailState = (initial?: ConversationDetailDTO) => {
  const [detail, setRenderedDetail] = useState(initial);
  const detailRef = useRef(initial);
  const setDetail = useCallback(
    (action: SetStateAction<ConversationDetailDTO | undefined>) => {
      const next =
        typeof action === "function" ? action(detailRef.current) : action;
      detailRef.current = next;
      setRenderedDetail(next);
    },
    [],
  );
  return { detail, detailRef, setDetail };
};
