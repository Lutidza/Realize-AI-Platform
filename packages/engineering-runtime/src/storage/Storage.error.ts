/**
 * @file packages/engineering-runtime/src/storage/Storage.error.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Представляет безопасные ошибки приватного хранилища без раскрытия OS paths.
 * @see documentation/architecture/engineering-operations.md
 */
import type { StorageErrorCode } from "./EngineeringStorage.types.ts";

/** Код позволяет facade явно преобразовать отказ storage в свой error envelope. */
export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}
