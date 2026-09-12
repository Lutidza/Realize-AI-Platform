/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/useWorkflowRunDetail.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Согласует полную карточку процесса с общими mutation и SSE owners.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DataOperationDTO,
  RunDTO,
  WorkflowRunDetailDTO,
} from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";
import { RealizeAIRequestError } from "../RealizeAIRequest.error";
import { useRunStream } from "../useRunStream";
import { useDataOperationActions } from "../useDataOperationActions.hook";
import { useWorkflowContinuation } from "../chat/useWorkflowContinuation.hook";
import { useWorkflowRunLeaveGuard } from "./useWorkflowRunLeaveGuard.hook";

export const useWorkflowRunDetail = (rootRunID: string) => {
  const [detail, setDetail] = useState<WorkflowRunDetailDTO>();
  const [latestRun, setLatestRun] = useState<RunDTO>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState("");
  const [operationPending, setOperationPending] = useState<string>();
  const [operationDrafts, setOperationDrafts] = useState<
    Record<string, boolean>
  >({});
  const [cancelling, setCancelling] = useState(false);
  const [cancelRetry, setCancelRetry] = useState<{
    runID: string;
    key: string;
  }>();
  const request = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const cancelMutex = useRef(false);
  const latestRunRef = useRef<RunDTO | undefined>(undefined);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    setLoading(true);
    setError(undefined);
    try {
      const next = await requestRealizeAI<WorkflowRunDetailDTO>(
        `/workflow-runs/${encodeURIComponent(rootRunID)}`,
        {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
        },
      );
      if (!abort.signal.aborted && mounted.current) {
        setDetail(next);
        latestRunRef.current = next.item.latestRun;
        setLatestRun(next.item.latestRun);
      }
      return next.item.latestRun;
    } catch (cause) {
      if (!abort.signal.aborted && mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось обновить запуск.",
        );
      throw cause;
    } finally {
      if (!abort.signal.aborted && mounted.current) setLoading(false);
    }
  }, [rootRunID]);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => void refresh().catch(() => {}), 0);
    return () => {
      window.clearTimeout(timer);
      mounted.current = false;
      request.current?.abort();
    };
  }, [refresh]);

  const commitOperation = useCallback(
    (operation: DataOperationDTO) => {
      if (!mounted.current) return;
      if (operation.state !== "awaiting_approval")
        setOperationDrafts((current) => ({
          ...current,
          [operation.id]: false,
        }));
      setDetail((current) =>
        current
          ? {
              ...current,
              dataOperations: current.dataOperations.map((item) =>
                item.id === operation.id ? operation : item,
              ),
            }
          : current,
      );
      void refresh().catch(() => {});
    },
    [refresh],
  );
  const dataActions = useDataOperationActions({
    dataOperations: detail?.dataOperations,
    commit: commitOperation,
    setError,
    setPending: setOperationPending,
  });

  const serverActions = detail?.item.actions;
  const actionsCurrent = Boolean(
    detail &&
    latestRun &&
    detail.item.latestRun.id === latestRun.id &&
    detail.item.latestRun.status === latestRun.status &&
    detail.item.latestRun.workflow?.version === latestRun.workflow?.version,
  );
  const canAdvance = Boolean(
    actionsCurrent &&
    (serverActions?.continue || serverActions?.reply || serverActions?.recover),
  );
  const unresolvedCancel = Boolean(
    cancelRetry &&
    latestRun?.id === cancelRetry.runID &&
    (latestRun.status === "queued" || latestRun.status === "running"),
  );
  const continuation = useWorkflowContinuation({
    run: latestRun,
    runs: latestRun ? [latestRun] : [],
    conversationID: detail?.item.conversation.id,
    archived: detail?.item.conversation.status === "archived",
    enabled: canAdvance,
    ready: !loading,
    busy: dataActions.isLocked || cancelling || unresolvedCancel,
    draft,
    setDraft,
    acceptResult: (result) => {
      if (mounted.current) {
        latestRunRef.current = result.run;
        setLatestRun(result.run);
      }
    },
    refresh,
  });
  const onRunUpdate = useCallback(
    (run: RunDTO) => {
      const previous = latestRunRef.current;
      if (!mounted.current || previous?.id !== run.id) return;
      latestRunRef.current = run;
      setLatestRun(run);
      // SSE сообщает переход queued→running; права и состояние карточки подтверждает свежий GET.
      if (previous.status !== run.status && run.status === "running")
        void refresh().catch(() => {});
    },
    [refresh],
  );
  const onTerminal = useCallback(async () => {
    await refresh();
  }, [refresh]);
  const stream = useRunStream({ run: latestRun, onRunUpdate, onTerminal });

  const cancel = async () => {
    if (
      !latestRun ||
      cancelMutex.current ||
      continuation.isLocked ||
      dataActions.isLocked ||
      (!unresolvedCancel && (!actionsCurrent || !serverActions?.cancel))
    )
      return;
    const pending = (unresolvedCancel ? cancelRetry : undefined) ?? {
      runID: latestRun.id,
      key: crypto.randomUUID(),
    };
    cancelMutex.current = true;
    setCancelling(true);
    setError(undefined);
    let accepted = false;
    try {
      await requestRealizeAI(
        `/runs/${encodeURIComponent(pending.runID)}/cancel`,
        {
          method: "POST",
          body: "{}",
          headers: { "Idempotency-Key": pending.key },
          signal: AbortSignal.timeout(15_000),
        },
      );
      accepted = true;
      setCancelRetry(undefined);
      await refresh();
    } catch (cause) {
      const rejected =
        cause instanceof RealizeAIRequestError &&
        cause.status !== undefined &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 429;
      setCancelRetry(rejected || accepted ? undefined : pending);
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось остановить запуск.",
      );
    } finally {
      cancelMutex.current = false;
      setCancelling(false);
    }
  };
  const isBusy =
    continuation.isPending ||
    continuation.isRefreshing ||
    cancelling ||
    Boolean(operationPending);
  const isLocked =
    continuation.isLocked || dataActions.isLocked || isBusy || unresolvedCancel;
  const dirty = Boolean(draft || Object.values(operationDrafts).some(Boolean));
  useWorkflowRunLeaveGuard(isLocked || dirty);
  const setOperationDraft = useCallback(
    (id: string, value: boolean) =>
      setOperationDrafts((current) =>
        current[id] === value ? current : { ...current, [id]: value },
      ),
    [],
  );
  return {
    detail,
    latestRun,
    loading,
    error,
    draft,
    setDraft,
    continuation,
    stream,
    dataActions,
    operationPending,
    setOperationDraft,
    isBusy,
    isLocked,
    navigationLocked: isLocked || dirty,
    cancel,
    cancelling,
    cancelRetry: unresolvedCancel,
    canCancel: Boolean(
      actionsCurrent &&
      serverActions?.cancel &&
      !continuation.isLocked &&
      !operationPending &&
      !cancelling,
    ),
    refresh,
  };
};
