/**
 * @file scripts/runtime/MediaJobsRuntime.types.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Описывает жизненный цикл единственного исполнителя штатных заданий Media.
 * @see documentation/delivery/01-local-admin-ai.md
 */

/** Блокировка принадлежит соединению PostgreSQL, независимо от checkout и режима AI. */
export type MediaJobsLock = {
  assertHeld: () => Promise<void>;
  release: () => Promise<void>;
};

/** Адаптер сохраняет очередь, повторы и журнал в штатном Payload Jobs. */
export type MediaJobsRuntime = {
  recover: (
    assertHeld: () => Promise<void>,
  ) => Promise<{ recovered: number; failed: number }>;
  run: () => Promise<void>;
  close: () => Promise<void>;
};

export type MediaJobsRunnerOptions = {
  databaseUrl: string;
  signal: AbortSignal;
  initialize: () => Promise<MediaJobsRuntime>;
  /** Потеря lock требует немедленно прекратить процесс, а не продолжать старое задание. */
  onLockLost: () => void;
  intervalMs?: number;
  log?: (message: string) => void;
  acquireLock?: (
    databaseUrl: string,
    onLost: () => void,
  ) => Promise<MediaJobsLock>;
};
