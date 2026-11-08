/**
 * @file packages/engineering-runtime/src/native/NativeFilesystem.types.ts
 * @version 1.2.0
 * @date 2026-10-28
 * @description Определяет Linux rename primitives с exact identity и trusted host binding бинарника.
 * @see documentation/architecture/engineering-operations.md
 */

/** Вызовы не создают subprocess; caller отвечает за journal, lease и fsync после publication. */
export interface NativeFilesystem {
  renameNoReplace(
    sourceParentFd: number,
    sourceName: string,
    targetParentFd: number,
    targetName: string,
    expectedSourceDev?: string,
    expectedSourceIno?: string,
  ): void;
  /** Атомарно меняет местами prepared и live regular files, сохраняя прежний inode в staging. */
  renameExchange?(
    sourceParentFd: number,
    sourceName: string,
    targetParentFd: number,
    targetName: string,
    expectedSourceDev: string,
    expectedSourceIno: string,
    expectedTargetDev: string,
    expectedTargetIno: string,
  ): void;
  inspectFd(fd: number): void;
}

/** Path и SHA задаёт trusted host; request JSON не является источником executable code. */
export type LoadEngineeringNativeInput = { path: string; sha256: string };
export type NativeFilesystemErrorCode =
  "CONFLICT" | "UNSUPPORTED" | "INTERNAL_ERROR";
