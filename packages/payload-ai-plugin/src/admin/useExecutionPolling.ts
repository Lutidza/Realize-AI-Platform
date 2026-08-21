/**
 * @file packages/payload-ai-plugin/src/admin/useExecutionPolling.ts
 * @version 2026-08-21
 * @description Refreshes durable execution and preview evidence while a worker job is active.
 */

"use client";

import type { ConversationDetailDTO } from "@realize/ai-contracts";
import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";

import { chatErrorMessage } from "./chatState";
import { requestRealizeAI } from "./realizeAIAPI";

const activeStatuses = new Set([
  "preparing_workspace",
  "queued",
  "running",
  "validating",
]);

const activePreviewStatuses = new Set([
  "committing",
  "preparing_workspace",
  "queued",
  "reviewing",
  "running_checks",
  "starting_preview",
]);

/** Polls only while the selected conversation owns a non-terminal code job. */
export const useExecutionPolling = (input: {
  detail?: ConversationDetailDTO;
  detailRef: { current: ConversationDetailDTO | undefined };
  setDetail: Dispatch<SetStateAction<ConversationDetailDTO | undefined>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
}): void => {
  const { detail, detailRef, setDetail, setError } = input;
  const conversationID = detail?.conversation.id;
  const hasActiveWorker = detail?.changeRequests.some((change) => {
    const status = change.execution.job?.status;
    const previewStatus = change.preview.deployment?.status;
    return (
      (status ? activeStatuses.has(status) : false) ||
      (previewStatus ? activePreviewStatuses.has(previewStatus) : false)
    );
  });

  useEffect(() => {
    if (!conversationID || !hasActiveWorker) return;
    let stopped = false;
    let running = false;
    const refresh = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const detail = await requestRealizeAI<ConversationDetailDTO>(
          `/conversations/${conversationID}`,
        );
        if (!stopped && detailRef.current?.conversation.id === conversationID) {
          detailRef.current = detail;
          setDetail(detail);
        }
      } catch (cause) {
        if (!stopped) {
          setError(
            chatErrorMessage(cause, "Не удалось обновить execution status."),
          );
        }
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 1_500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [conversationID, hasActiveWorker, detailRef, setDetail, setError]);
};
