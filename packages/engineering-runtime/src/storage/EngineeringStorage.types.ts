/**
 * @file packages/engineering-runtime/src/storage/EngineeringStorage.types.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Определяет приватный контракт журнала операций, транзакций и workspace lease.
 * @see documentation/architecture/engineering-operations.md
 */

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Запись storage не является публичной проекцией операции: payload принадлежит engine. */
export type StoredOperation = {
  operationId: string;
  revision: number;
  workspaceId: string;
  state: string;
  writeBlock: "fs_unresolved" | "writer_unconfirmed" | null;
  payload: JsonValue;
};

/** Identity ключа сохраняется бессрочно; API удаления отсутствует. */
export type StoredRequest = { key: string; hash: string; operationId: string };
export type EventInput = {
  operationId: string;
  revision: number;
  kind: string;
  at: string;
  attempt?: number | null;
  manifestRef?: string | null;
};
export type StoredEvent = EventInput & {
  seq: number;
  attempt: number | null;
  manifestRef: string | null;
};

/** Приватная привязка host: пути и inode никогда не передаются remote клиенту. */
export type StorageBinding = {
  installationId: string;
  workspaceId: string;
  targetId: string;
  canonicalRoot: string;
  rootIdentity: { dev: string; ino: string };
  epoch: string;
};

export type StorageLimits = {
  maxPayloadBytes: number;
  maxOperations: number;
  maxRequests: number;
  maxEvents: number;
  maxDatabaseBytes: number;
};

/** Каталог state задаётся trusted host configuration и должен быть вне checkout. */
export type OpenEngineeringStoreInput = {
  stateDirectory: string;
  checkoutRoot: string;
  installationId: string;
  workspaceId: string;
  targetId: string;
  limits?: Partial<StorageLimits>;
};

export type StorageTransaction = {
  getOperation(operationId: string): StoredOperation | null;
  insertOperation(operation: StoredOperation): void;
  replaceOperation(operation: StoredOperation, expectedRevision: number): void;
  getRequest(key: string): StoredRequest | null;
  insertRequest(request: StoredRequest): void;
  appendEvent(event: EventInput): StoredEvent;
  /** Увеличивает оставшийся резерв до minimum; уменьшение выполняется только расходом или release. */
  reserveFinishCapacity(operationId: string, minimum: FinishCapacity): void;
  releaseFinishCapacity(operationId: string): void;
};

export type FinishCapacity = {
  events: number;
  bytes: number;
  requests: number;
};
export type StorageTransactionOptions = { finishOperationId?: string };

/** Lease действителен только внутри callback и не доказывает остановку сторонних writers. */
export type WorkspaceLease = { assertHeld(): void };

export type EngineeringStore = {
  readonly binding: Readonly<StorageBinding>;
  transaction<T>(
    callback: (transaction: StorageTransaction) => T,
    options?: StorageTransactionOptions,
  ): T;
  getOperation(operationId: string): StoredOperation | null;
  getRequest(key: string): StoredRequest | null;
  listEvents(input?: { afterSeq?: number; limit?: number }): StoredEvent[];
  listBlockedOperations(): StoredOperation[];
  withWorkspaceLease<T>(
    callback: (lease: WorkspaceLease) => Promise<T>,
  ): Promise<T>;
  close(): void;
};

export type StorageErrorCode =
  | "CONFLICT"
  | "INVALID_INPUT"
  | "LIMIT_EXCEEDED"
  | "UNSUPPORTED"
  | "INTERNAL_ERROR";
