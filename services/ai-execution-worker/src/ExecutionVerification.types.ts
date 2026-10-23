/**
 * @file services/ai-execution-worker/src/ExecutionVerification.types.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Описывает серверный контекст проверки и подтверждённую копию зависимостей изолированного worktree.
 */
import type { VerificationDependencyLease } from "@realize/verification-runtime";

/** Поля поступают из проверенного задания worker, а не из текста модели или файлов worktree. */
export type ExecutionVerificationContext = {
  changeRequestID: number;
  dependencyLease: VerificationDependencyLease;
  reason: string;
};

export type ExecutionCheckInput = {
  command: string;
  environment?: Partial<NodeJS.ProcessEnv>;
  repositoryRoot: string;
  timeoutMs?: number;
  verification: ExecutionVerificationContext;
  workspace: string;
};

export type ExecutionCheckDefinition = {
  command: string[];
  reuse: "local" | "never";
};
