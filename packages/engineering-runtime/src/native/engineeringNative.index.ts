/**
 * @file packages/engineering-runtime/src/native/engineeringNative.index.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Экспортирует проверяемый loader синхронных Linux filesystem primitives.
 * @see documentation/architecture/engineering-operations.md
 */
export { loadEngineeringNative } from "./loadEngineeringNative.adapter.ts";
export { NativeFilesystemError } from "./NativeFilesystem.error.ts";
export type {
  LoadEngineeringNativeInput,
  NativeFilesystem,
  NativeFilesystemErrorCode,
} from "./NativeFilesystem.types.ts";
