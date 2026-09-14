/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationActions.types.ts
 * @version 1.1.0
 * @date 2026-09-14
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
  /** Creation возвращает новый ID; изменение source операции не подтверждает результат такого POST. */
  createsOperation?: boolean;
  conflictScope?: Omit<DataOperationStaleMarker, "message">;
};

/** Локальный запрет повторного подтверждения устаревшего плана; серверные проверки остаются обязательными. */
export type DataOperationStaleMarker = {
  operationID: string;
  expectedVersion: number;
  expectedOperationHash: string;
  message: string;
};
