/**
 * @file packages/payload-ai-plugin/src/admin/useDataOperations.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Связывает общие DataOperation actions с состоянием выбранного диалога.
 */

"use client";

import { useCallback } from "react";
import { upsertDataOperation } from "./chatState";
import { useDataOperationActions } from "./useDataOperationActions.hook";
import type { UseDataOperationsOptions } from "./DataOperations.types";
import type { DataOperationDTO } from "@realize/ai-contracts";

/** Запоздалый ответ не переносит операцию в другой открытый диалог. */
export const useDataOperations = ({
  detailRef,
  setDetail,
  setError,
  setPending,
}: UseDataOperationsOptions) => {
  const commit = useCallback(
    (operation: DataOperationDTO) => {
      setDetail((current) => {
        if (!current || current.conversation.id !== operation.conversationID)
          return current;
        const next = upsertDataOperation(current, operation);
        detailRef.current = next;
        return next;
      });
    },
    [detailRef, setDetail],
  );
  return useDataOperationActions({
    commit,
    setError,
    setPending,
    readDataOperations: () => detailRef.current?.dataOperations,
    readConversationID: () => detailRef.current?.conversation.id,
  });
};
