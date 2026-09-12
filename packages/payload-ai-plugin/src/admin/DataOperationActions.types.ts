/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationActions.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт независимые порты согласования DataOperation после пользовательского действия.
 */

import type { DataOperationDTO } from "@realize/ai-contracts";

export type DataOperationActionsOptions = {
  commit: (operation: DataOperationDTO) => void;
  setError: (message?: string) => void;
  setPending: (id?: string) => void;
  readConversationID?: () => string | undefined;
  /** Актуальные owned DTO позволяют согласовать потерянный ответ после внешнего refresh. */
  dataOperations?: readonly DataOperationDTO[];
  /** Чат читает ref только из effect/action, не во время render. */
  readDataOperations?: () => readonly DataOperationDTO[] | undefined;
};

/** Точный запрос удерживается до подтверждённого ответа или изменения durable версии. */
export type DataOperationPendingRequest = {
  pendingID: string;
  path: string;
  body: string;
  key: string;
  fallback: string;
  expectedVersion?: number;
};
