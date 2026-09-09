/**
 * @file .ai/tools/git-delivery/src/GitLock.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Описывает время жизни процессной блокировки общего каталога Git.
 */
export type GitLock = {
  descriptor: number;
  assertHeld(): void;
  release(): Promise<void>;
};
