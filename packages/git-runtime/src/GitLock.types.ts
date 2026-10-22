/**
 * @file packages/git-runtime/src/GitLock.types.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Описывает время жизни процессной блокировки общего каталога Git.
 */
declare const gitLockBrand: unique symbol;

/** Lease выдаётся общим owner; descriptor и объект клиента не создают полномочие. */
export type GitLock = {
  readonly [gitLockBrand]: true;
  readonly descriptor: number;
  readonly commonDirectory: string;
  assertHeld(): void;
  release(): Promise<void>;
};

export type GitRepositoryLockInput = {
  repositoryRoot: string;
  existingLease?: GitLock;
  command?: string;
  signal?: AbortSignal;
};
