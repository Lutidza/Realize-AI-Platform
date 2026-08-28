/**
 * @file packages/payload-ai-plugin/src/admin/useDataOperations.ts
 * @version 2026-08-28
 * @description Управляет dry-run, approval, apply и rollback DataOperation из Admin.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

"use client";

import type {
  ConversationDetailDTO,
  DataOperationDTO,
} from "@realize/ai-contracts";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";

import { chatErrorMessage, upsertDataOperation } from "./chatState";
import { requestRealizeAI } from "./realizeAIAPI";

type UseDataOperationsOptions = {
  detailRef: { current: ConversationDetailDTO | undefined };
  setDetail: Dispatch<SetStateAction<ConversationDetailDTO | undefined>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
  setPending: Dispatch<SetStateAction<string | undefined>>;
};

/** Returns typed Data Lane actions over the provider-owned conversation state. */
export const useDataOperations = ({
  detailRef,
  setDetail,
  setError,
  setPending,
}: UseDataOperationsOptions) => {
  const commit = useCallback(
    (operation: DataOperationDTO) => {
      setDetail((current) => {
        if (!current) return current;
        const next = upsertDataOperation(current, operation);
        detailRef.current = next;
        return next;
      });
    },
    [detailRef, setDetail],
  );

  const mutate = useCallback(
    async (
      pendingID: string,
      path: string,
      body: Record<string, unknown>,
      fallback: string,
    ) => {
      setPending(pendingID);
      setError(undefined);
      try {
        const operation = await requestRealizeAI<DataOperationDTO>(path, {
          body: JSON.stringify(body),
          headers: { "Idempotency-Key": crypto.randomUUID() },
          method: "POST",
        });
        commit(operation);
      } catch (cause) {
        setError(chatErrorMessage(cause, fallback));
        const operationPath = /^\/data-operations\/([^/]+)\//.exec(path);
        if (operationPath) {
          try {
            commit(
              await requestRealizeAI<DataOperationDTO>(
                `/data-operations/${operationPath[1]}`,
              ),
            );
          } catch {
            // Keep the original mutation error; a later detail reload will reconcile state.
          }
        }
      } finally {
        setPending(undefined);
      }
    },
    [commit, setError, setPending],
  );

  const createDataOperation = useCallback(
    async (messageID: string) => {
      const conversationID = detailRef.current?.conversation.id;
      if (!conversationID) return;
      await mutate(
        messageID,
        `/conversations/${conversationID}/data-operations`,
        { sourceMessageID: messageID },
        "Не удалось подготовить dry-run изменения данных.",
      );
    },
    [detailRef, mutate],
  );

  const decideDataOperation = useCallback(
    async (
      operation: DataOperationDTO,
      decision: "approve" | "reject",
      comment?: string,
    ) => {
      await mutate(
        operation.id,
        `/data-operations/${operation.id}/${decision}`,
        {
          comment,
          expectedOperationHash: operation.operationHash,
          expectedVersion: operation.version,
        },
        "Не удалось сохранить решение по изменению данных.",
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
        "Не удалось применить изменение через Payload.",
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
        "Не удалось восстановить before-snapshot.",
      );
    },
    [mutate],
  );

  return {
    applyDataOperation,
    approveDataRollback,
    createDataOperation,
    decideDataOperation,
    rollbackDataOperation,
  };
};
