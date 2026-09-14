/**
 * @file packages/payload-ai-plugin/src/admin/useDataOperationActions.hook.ts
 * @version 1.2.0
 * @date 2026-09-14
 * @description Выполняет общие DataOperation HTTP-действия и согласует результат без зависимости от conversation DTO.
 */

"use client";

import type {
  DataOperationDTO,
  PagePublicationReviewInput,
} from "@realize/ai-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { chatErrorMessage } from "./chatState";
import { requestRealizeAI } from "./realizeAIAPI";
import { RealizeAIRequestError } from "./RealizeAIRequest.error";
import type {
  DataOperationActionsOptions,
  DataOperationPendingRequest,
  DataOperationStaleMarker,
} from "./DataOperationActions.types";

/** Возвращает hash/version-bound действия для чата и карточки процесса. */
export const useDataOperationActions = ({
  commit,
  setError,
  setPending,
  readConversationID,
  dataOperations,
  readDataOperations,
}: DataOperationActionsOptions) => {
  const inFlight = useRef(false);
  const unresolvedRef = useRef<DataOperationPendingRequest | undefined>(
    undefined,
  );
  const [hasRetry, setHasRetry] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [staleMarkers, setStaleMarkers] = useState<
    Record<string, DataOperationStaleMarker>
  >({});

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const latest = dataOperations ?? readDataOperations?.();
      if (latest)
        setStaleMarkers((current) => {
          const entries = Object.entries(current).filter(([id, marker]) => {
            const operation = latest.find((item) => item.id === id);
            return (
              !operation ||
              (operation.version === marker.expectedVersion &&
                operation.operationHash === marker.expectedOperationHash)
            );
          });
          return entries.length === Object.keys(current).length
            ? current
            : Object.fromEntries(entries);
        });
    });
    return () => {
      active = false;
    };
  }, [dataOperations, readDataOperations]);

  const reconcile = useCallback(() => {
    const pending = unresolvedRef.current;
    if (!pending || inFlight.current || pending.createsOperation) return;
    const operationID = /^\/data-operations\/([^/]+)\//.exec(pending.path)?.[1];
    const operation = (dataOperations ?? readDataOperations?.())?.find(
      (item) => item.id === operationID,
    );
    // Более новая CAS-версия делает исходное действие завершённым либо устаревшим.
    if (
      operation &&
      pending.expectedVersion !== undefined &&
      operation.version > pending.expectedVersion
    ) {
      unresolvedRef.current = undefined;
      setHasRetry(false);
    }
  }, [dataOperations, readDataOperations]);

  useEffect(() => {
    reconcile();
  }, [reconcile, isPending, hasRetry]);

  const execute = useCallback(
    async (request: DataOperationPendingRequest) => {
      if (inFlight.current) return;
      inFlight.current = true;
      unresolvedRef.current = request;
      setIsPending(true);
      setHasRetry(false);
      setPending(request.pendingID);
      setError(undefined);
      try {
        const operation = await requestRealizeAI<DataOperationDTO>(
          request.path,
          {
            body: request.body,
            headers: { "Idempotency-Key": request.key },
            method: "POST",
            signal: AbortSignal.timeout(15_000),
          },
        );
        unresolvedRef.current = undefined;
        commit(operation);
      } catch (cause) {
        if (
          cause instanceof RealizeAIRequestError &&
          cause.status === 409 &&
          request.conflictScope
        ) {
          const marker = {
            ...request.conflictScope,
            message:
              "Версия страницы, её проверка или текущая публикация изменились. Подготовьте новую операцию публикации или восстановления.",
          };
          setStaleMarkers((current) => ({
            ...current,
            [marker.operationID]: marker,
          }));
        }
        const rejected =
          cause instanceof RealizeAIRequestError &&
          cause.status !== undefined &&
          cause.status >= 400 &&
          cause.status < 500 &&
          cause.status !== 429;
        if (rejected) unresolvedRef.current = undefined;
        setError(chatErrorMessage(cause, request.fallback));
        const operationPath = /^\/data-operations\/([^/]+)\//.exec(
          request.path,
        );
        if (operationPath && !request.createsOperation) {
          try {
            const operation = await requestRealizeAI<DataOperationDTO>(
              `/data-operations/${operationPath[1]}`,
            );
            commit(operation);
            // GET той же версии не исключает ещё выполняющийся исходный POST.
            if (
              request.expectedVersion !== undefined &&
              operation.version > request.expectedVersion
            )
              unresolvedRef.current = undefined;
          } catch {
            // Ошибка исходного действия остаётся видимой; повтор сохранит прежний ключ и тело.
          }
        }
        setHasRetry(Boolean(unresolvedRef.current));
      } finally {
        inFlight.current = false;
        setIsPending(false);
        setPending(undefined);
      }
    },
    [commit, setError, setPending],
  );

  const mutate = useCallback(
    async (
      pendingID: string,
      path: string,
      body: Record<string, unknown>,
      fallback: string,
      createsOperation = false,
      conflictScope?: DataOperationPendingRequest["conflictScope"],
    ) => {
      reconcile();
      const pending = unresolvedRef.current;
      if (
        pending &&
        (pending.pendingID !== pendingID || pending.path !== path)
      ) {
        setError("Сначала повторите неподтверждённое действие с данными.");
        return;
      }
      await execute(
        pending ?? {
          pendingID,
          path,
          body: JSON.stringify(body),
          key: crypto.randomUUID(),
          fallback,
          createsOperation,
          conflictScope,
          ...(typeof body.expectedVersion === "number"
            ? { expectedVersion: body.expectedVersion }
            : {}),
        },
      );
    },
    [execute, reconcile, setError],
  );

  const createDataOperation = useCallback(
    async (messageID: string) => {
      const conversationID = readConversationID?.();
      if (!conversationID) return;
      await mutate(
        messageID,
        `/conversations/${conversationID}/data-operations`,
        { sourceMessageID: messageID },
        "Не удалось подготовить изменение данных для проверки.",
      );
    },
    [readConversationID, mutate],
  );

  const decideDataOperation = useCallback(
    async (
      operation: DataOperationDTO,
      decision: "approve" | "reject",
      comment?: string,
      previewReview?: PagePublicationReviewInput,
    ) => {
      await mutate(
        operation.id,
        `/data-operations/${operation.id}/${decision}`,
        {
          comment,
          expectedOperationHash: operation.operationHash,
          expectedVersion: operation.version,
          ...(previewReview ? { previewReview } : {}),
        },
        "Не удалось сохранить решение по изменению данных.",
        false,
        decision === "approve" &&
          (operation.kind === "pages.publishDraft.v1" ||
            operation.kind === "pages.restorePublication.v1")
          ? {
              operationID: operation.id,
              expectedVersion: operation.version,
              expectedOperationHash: operation.operationHash,
            }
          : undefined,
      );
    },
    [mutate],
  );

  const applyDataOperation = useCallback(
    async (operation: DataOperationDTO) => {
      await mutate(
        operation.id,
        `/data-operations/${operation.id}/apply`,
        {
          expectedOperationHash: operation.operationHash,
          expectedVersion: operation.version,
        },
        "Не удалось применить изменение данных.",
        false,
        operation.kind === "pages.publishDraft.v1" ||
          operation.kind === "pages.restorePublication.v1"
          ? {
              operationID: operation.id,
              expectedVersion: operation.version,
              expectedOperationHash: operation.operationHash,
            }
          : undefined,
      );
    },
    [mutate],
  );

  const preparePagePublication = useCallback(
    async (operation: DataOperationDTO) => {
      await mutate(
        operation.id,
        `/data-operations/${operation.id}/page-publication`,
        {
          expectedVersion: operation.version,
          expectedOperationHash: operation.operationHash,
        },
        "Не удалось подготовить публикацию сохранённой версии.",
        true,
      );
    },
    [mutate],
  );

  const preparePublicationRestore = useCallback(
    async (operation: DataOperationDTO) => {
      await mutate(
        operation.id,
        `/data-operations/${operation.id}/page-publication-restore`,
        {
          expectedVersion: operation.version,
          expectedOperationHash: operation.operationHash,
        },
        "Не удалось подготовить восстановление публикации.",
        true,
      );
    },
    [mutate],
  );

  const retryPublicationDelivery = useCallback(
    async (operation: DataOperationDTO) => {
      await mutate(
        operation.id,
        `/data-operations/${operation.id}/page-publication-delivery`,
        {
          expectedVersion: operation.version,
          expectedOperationHash: operation.operationHash,
        },
        "Не удалось обновить витрину. Публикация повторно не выполнялась.",
      );
    },
    [mutate],
  );

  const approveDataRollback = useCallback(
    async (operation: DataOperationDTO) => {
      await mutate(
        operation.id,
        `/data-operations/${operation.id}/approve-rollback`,
        {
          expectedRollbackHash: operation.rollbackHash,
          expectedVersion: operation.version,
        },
        "Не удалось подтвердить безопасный откат.",
      );
    },
    [mutate],
  );

  const rollbackDataOperation = useCallback(
    async (operation: DataOperationDTO) => {
      await mutate(
        operation.id,
        `/data-operations/${operation.id}/rollback`,
        {
          expectedRollbackHash: operation.rollbackHash,
          expectedVersion: operation.version,
        },
        "Не удалось отменить изменение данных.",
      );
    },
    [mutate],
  );

  return {
    staleMarkers,
    hasRetry,
    isLocked: isPending || hasRetry,
    retry: async () => {
      reconcile();
      const pending = unresolvedRef.current;
      if (pending) await execute(pending);
    },
    applyDataOperation,
    approveDataRollback,
    createDataOperation,
    preparePagePublication,
    preparePublicationRestore,
    retryPublicationDelivery,
    decideDataOperation,
    rollbackDataOperation,
  };
};
