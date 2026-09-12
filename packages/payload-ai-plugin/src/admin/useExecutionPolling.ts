/**
 * @file packages/payload-ai-plugin/src/admin/useExecutionPolling.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Обновляет этапы выполнения видимого диалога без перезаписи новых событий и действий.
 */

"use client";

import type { ConversationDetailDTO } from "@realize/ai-contracts";
import { useEffect } from "react";

import { chatErrorMessage } from "./chatState";
import { requestRealizeAI } from "./realizeAIAPI";
import type { ExecutionPollingOptions } from "./useExecutionPolling.types";

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

const activeReleaseStatuses = new Set([
  "building",
  "deploying_preview",
  "preparing",
  "queued",
  "scanning",
  "verifying_preview",
]);

const activeSourcePromotionStatuses = new Set([
  "creating_pull_request",
  "publishing_ref",
  "queued",
  "validating",
]);

/** Читает только незавершённые задания; фоновые ответы не заменяют более новый снимок диалога. */
export const useExecutionPolling = (input: ExecutionPollingOptions): void => {
  const { detail, detailRef, setDetail, setError } = input;
  const conversationID = detail?.conversation.id;
  const hasActiveWorker = detail?.changeRequests.some((change) => {
    const status = change.execution.job?.status;
    const previewStatus = change.preview.deployment?.status;
    const releaseStatus = change.release.candidate?.status;
    const sourcePromotionStatus = change.sourcePromotion.promotion?.status;
    return (
      (status ? activeStatuses.has(status) : false) ||
      (previewStatus ? activePreviewStatuses.has(previewStatus) : false) ||
      (releaseStatus ? activeReleaseStatuses.has(releaseStatus) : false) ||
      (sourcePromotionStatus
        ? activeSourcePromotionStatuses.has(sourcePromotionStatus)
        : false)
    );
  });

  useEffect(() => {
    if (!conversationID || !hasActiveWorker) return;
    let stopped = false;
    let controller: AbortController | undefined;
    let deadline: number | undefined;
    let pollingError: string | undefined;
    const reportError = (message: string) => {
      pollingError = message;
      setError(message);
    };
    const pause = () => {
      window.clearTimeout(deadline);
      controller?.abort();
      controller = undefined;
    };
    const refresh = async () => {
      if (stopped || document.hidden || controller) return;
      const snapshot = detailRef.current;
      const current = new AbortController();
      controller = current;
      deadline = window.setTimeout(() => {
        if (stopped || controller !== current) return;
        pause();
        if (detailRef.current === snapshot)
          reportError(
            "Сервис не ответил вовремя. Состояние выполнения пока не обновлено.",
          );
      }, 10_000);
      try {
        const next = await requestRealizeAI<ConversationDetailDTO>(
          `/conversations/${conversationID}`,
          { signal: current.signal },
        );
        if (stopped || current.signal.aborted) return;
        const previousError = pollingError;
        if (previousError) {
          setError((latest) => (latest === previousError ? undefined : latest));
          pollingError = undefined;
        }
        // SSE и действия пользователя могли обновить ref или очередь React, пока шёл запрос.
        if (detailRef.current !== snapshot) return;
        detailRef.current = next;
        // Updater остаётся чистым: React может повторно вызвать его в Strict Mode.
        setDetail((latest) => (latest === snapshot ? next : latest));
      } catch (cause) {
        if (
          !stopped &&
          !current.signal.aborted &&
          detailRef.current === snapshot
        ) {
          reportError(
            chatErrorMessage(
              cause,
              "Не удалось обновить состояние выполнения.",
            ),
          );
        }
      } finally {
        if (controller === current) {
          window.clearTimeout(deadline);
          controller = undefined;
        }
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        pause();
      } else void refresh();
    };
    const timer = window.setInterval(() => void refresh(), 1_500);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      pause();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [conversationID, hasActiveWorker, detailRef, setDetail, setError]);
};
