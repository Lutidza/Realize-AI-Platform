/**
 * @file packages/payload-ai-plugin/src/admin/chat/useWorkflowContinuation.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Продолжает один workflow checkpoint с точным повтором и согласованием сохранённого результата.
 */

"use client";

import { useRef, useState } from "react";
import type { ContinueWorkflowInput, RunDTO } from "@realize/ai-contracts";
import { RealizeAIRequestError } from "../RealizeAIRequest.error";
import { requestRealizeAI } from "../realizeAIAPI";
import { getWorkflowRunRootId } from "./getWorkflowRunRootId.util";
import type {
  WorkflowContinuationController,
  WorkflowContinuationOptions,
  WorkflowContinuationRequest,
  WorkflowContinuationResult,
} from "./WorkflowContinuation.types";

/** Восстановление очереди подтверждается статусом того же run без нового checkpoint version. */
const confirmsRequest = (
  candidate: RunDTO,
  pending: WorkflowContinuationRequest,
): boolean => {
  if (
    candidate.conversationID !== pending.conversationID ||
    getWorkflowRunRootId(candidate) !== pending.rootID
  )
    return false;
  if ((candidate.workflow?.version ?? 0) > pending.version) return true;
  return (
    pending.run.status === "queued" &&
    pending.run.workflow?.phase === "running" &&
    candidate.id === pending.run.id &&
    candidate.status !== "queued" &&
    candidate.workflow?.version === pending.version &&
    candidate.workflow.stepKey === pending.run.workflow.stepKey
  );
};

/** Не запускает шаг при чтении detail; действие всегда вызывается явно из UI. */
export const useWorkflowContinuation = (
  options: WorkflowContinuationOptions,
): WorkflowContinuationController => {
  const [failure, setFailure] = useState<{ runID: string; message: string }>();
  const [isPending, setPending] = useState(false);
  const [isRefreshing, setRefreshing] = useState(false);
  const [refreshRequiredRunID, setRefreshRequiredRunID] = useState<string>();
  const [pendingRequest, setPendingRequest] =
    useState<WorkflowContinuationRequest>();
  const inFlight = useRef(false);
  const candidates = options.runs ?? (options.run ? [options.run] : []);
  const unresolved =
    pendingRequest &&
    !candidates.some((candidate) => confirmsRequest(candidate, pendingRequest))
      ? pendingRequest
      : undefined;
  // Подтверждённый сервером запрос больше не восстанавливается из старого UI-снимка.
  if (pendingRequest && !unresolved && !isPending) {
    setPendingRequest(undefined);
    setFailure(undefined);
  }
  const run =
    unresolved && unresolved.conversationID === options.conversationID
      ? (candidates.find((candidate) => candidate.id === unresolved.run.id) ??
        unresolved.run)
      : options.run;
  const checkpoint = run?.workflow;
  const queuedRecovery =
    run?.status === "queued" && checkpoint?.phase === "running";
  const canContinue = Boolean(
    run &&
    checkpoint &&
    options.enabled &&
    options.ready &&
    !options.busy &&
    !options.archived &&
    !isPending &&
    !isRefreshing &&
    refreshRequiredRunID !== run.id &&
    (!unresolved || unresolved.conversationID === options.conversationID) &&
    (run.status === "completed" || queuedRecovery) &&
    (queuedRecovery ||
      checkpoint.phase === "ready" ||
      checkpoint.phase === "awaiting_input"),
  );

  const continueWorkflow = async () => {
    if (!canContinue || !run || !checkpoint || inFlight.current) return;
    const sameCheckpoint = unresolved?.run.id === run.id;
    if (
      !sameCheckpoint &&
      checkpoint.phase === "awaiting_input" &&
      (!options.draft.trim() || options.hasContext)
    ) {
      setFailure({
        runID: run.id,
        message: options.hasContext
          ? "Ответ на шаг принимает только текст. Удалите выбранные вложения, файлы и веб-поиск."
          : "Введите ответ на запрос процесса.",
      });
      return;
    }
    const body: ContinueWorkflowInput = {
      expectedVersion: checkpoint.version,
      expectedStepKey: checkpoint.stepKey,
      ...(checkpoint.phase === "awaiting_input"
        ? { content: options.draft.trim() }
        : {}),
    };
    const request = sameCheckpoint
      ? unresolved!
      : {
          run,
          conversationID: run.conversationID,
          rootID: getWorkflowRunRootId(run),
          version: checkpoint.version,
          key: crypto.randomUUID(),
          body: JSON.stringify(body),
          ...(checkpoint.phase === "awaiting_input"
            ? { draft: options.draft }
            : {}),
        };
    setPendingRequest(request);
    inFlight.current = true;
    setPending(true);
    setFailure(undefined);
    options.setError?.(undefined);
    let accepted = false;
    try {
      const result = await requestRealizeAI<WorkflowContinuationResult>(
        `/runs/${encodeURIComponent(request.run.id)}/workflow/continue`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          body: request.body,
          headers: { "Idempotency-Key": request.key },
        },
      );
      accepted = true;
      options.acceptResult(result, request.conversationID);
      if (request.draft !== undefined)
        options.setDraft((value) => (value === request.draft ? "" : value));
      setPendingRequest(undefined);
      await options.refresh(result.run);
    } catch (cause) {
      const rejected =
        cause instanceof RealizeAIRequestError &&
        cause.status !== undefined &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 429;
      setPendingRequest(rejected || accepted ? undefined : request);
      if (cause instanceof RealizeAIRequestError && cause.status === 409)
        setRefreshRequiredRunID(run.id);
      setFailure({
        runID: run.id,
        message:
          cause instanceof Error
            ? cause.message
            : "Не удалось продолжить процесс.",
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return {
    run,
    isPending,
    hasRetry: Boolean(
      unresolved && !isPending && unresolved.run.id === run?.id,
    ),
    isRefreshing,
    get isLocked() {
      return inFlight.current || Boolean(unresolved);
    },
    canContinue,
    error:
      (!pendingRequest || unresolved) && failure?.runID === run?.id
        ? failure?.message
        : undefined,
    pendingConversationID: !isPending ? unresolved?.conversationID : undefined,
    clearError: () => setFailure(undefined),
    continue: continueWorkflow,
    refresh: async () => {
      if (!run || isRefreshing || inFlight.current) return;
      setRefreshing(true);
      try {
        const latest = await options.refresh(run);
        if (latest && pendingRequest && confirmsRequest(latest, pendingRequest))
          setPendingRequest(undefined);
        setFailure(undefined);
        setRefreshRequiredRunID(undefined);
      } catch (cause) {
        setFailure({
          runID: run.id,
          message:
            cause instanceof Error
              ? cause.message
              : "Не удалось обновить процесс.",
        });
      } finally {
        setRefreshing(false);
      }
    },
  };
};
