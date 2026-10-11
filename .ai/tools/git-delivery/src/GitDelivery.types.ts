/**
 * @file .ai/tools/git-delivery/src/GitDelivery.types.ts
 * @version 1.1.0
 * @date 2026-10-11
 * @description Определяет команду, доверенное разрешение и безопасный результат локальной Git-операции.
 */

export type Action = "inspect" | "commit" | "push" | "commit_push";
/** Полный снимок может явно разрешать замену частичного индекса проверенными рабочими bytes. */
export type Scope =
  | { mode: "all"; includePartialIndex?: true }
  | { mode: "paths"; paths: string[] };
/** Команда модели не назначает разрешение, автора или выполненные проверки. */
export type Command = { action: Action; message?: string };
export type CheckResult = {
  id: string;
  status: "passed" | "failed";
  fingerprint: string;
};
export type Identity = { name: string; email: string };
/** Контекст вызывающей среды связывает операцию с разрешённой областью и evidence. */
export type Context = {
  version: 1;
  requestId: string;
  projectId: string;
  taskId: string;
  repositoryRoot: string;
  authorization: { actions: Action[]; scope: Scope };
  identity?: Identity;
  verification?: {
    inputPaths: string[];
    requiredChecks: string[];
    results: CheckResult[];
  };
  /** Явное разрешение одной попытки commit после исправления прежнего снимка. */
  recovery?: { attempt: number; previousFingerprint: string };
};
/** Результат не содержит содержимого файлов, сырой диагностики и секретов. */
export type Result = {
  version: 1;
  requestId: string | null;
  action: Action | null;
  status: "succeeded" | "noop" | "partial" | "blocked" | "failed";
  branch: string | null;
  commit: string | null;
  commitCreated: boolean | null;
  pushStatus: "not_requested" | "not_attempted";
  changes: { items: { path: string; status: string }[]; truncated: boolean };
  fingerprint: string | null;
  checks: { id: string; status: "passed" | "failed"; reused: boolean }[];
  errorCode: string | null;
  summary: string;
  retryable: boolean;
  recoveryAttempts?: number;
};
