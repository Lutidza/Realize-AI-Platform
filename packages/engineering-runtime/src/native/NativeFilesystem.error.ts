/**
 * @file packages/engineering-runtime/src/native/NativeFilesystem.error.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Возвращает безопасный код ошибки native loader без OS paths.
 * @see documentation/architecture/engineering-operations.md
 */
import type { NativeFilesystemErrorCode } from "./NativeFilesystem.types.ts";

/** Loader сообщает bounded failure; kernel primitive также возвращает один из этих code. */
export class NativeFilesystemError extends Error {
  readonly code: NativeFilesystemErrorCode;

  constructor(code: NativeFilesystemErrorCode, message: string) {
    super(message);
    this.name = "NativeFilesystemError";
    this.code = code;
  }
}
