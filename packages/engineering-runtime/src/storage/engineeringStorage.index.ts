/**
 * @file packages/engineering-runtime/src/storage/engineeringStorage.index.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Экспортирует приватный host API SQLite journal и workspace lease.
 * @see documentation/architecture/engineering-operations.md
 */
export { openEngineeringStore } from "./openEngineeringStore.repository.ts";
export { StorageError } from "./Storage.error.ts";
export type {
  EngineeringStore,
  EventInput,
  FinishCapacity,
  JsonValue,
  OpenEngineeringStoreInput,
  StorageBinding,
  StorageErrorCode,
  StorageLimits,
  StorageTransaction,
  StorageTransactionOptions,
  StoredEvent,
  StoredOperation,
  StoredRequest,
  WorkspaceLease,
} from "./EngineeringStorage.types.ts";
