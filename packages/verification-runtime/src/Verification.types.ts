/**
 * @file packages/verification-runtime/src/Verification.types.ts
 * @version 1.2.0
 * @date 2026-10-23
 * @description Контракты адресных проверок, проверяемых receipts и отчёта без полномочий Git.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
export type VerificationCheck = {
  id: string;
  command: string[];
  inputs: string[];
  excludeInputs?: string[];
  environment?: Record<string, string>;
  inheritEnvironment?: string[];
  timeoutMs: number;
  reuse: "local" | "never";
  extent: "targeted" | "full";
  reason?: string;
};
export type VerificationPlan = {
  version: 1;
  projectId: string;
  taskId: string;
  repositoryRoot: string;
  checks: VerificationCheck[];
};
export type VerificationStatus =
  | "passed"
  | "failed"
  | "cancelled"
  | "running"
  | "missing"
  | "stale"
  | "blocked";
export type VerificationResult = {
  id: string;
  status: VerificationStatus;
  executed: boolean;
  reused: boolean;
  recipeKey: string;
  key: string | null;
  receiptId: string | null;
  reason?: string;
  /** Безопасная диагностика несовместимого runtime до запуска; не является evidence проверки. */
  diagnostic?: string;
  logPath?: string;
  evidence?: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    result: VerificationProcessResult;
  };
};
export type VerificationReport = {
  version: 1;
  projectId: string;
  taskId: string;
  success: boolean;
  checks: VerificationResult[];
};
declare const verificationDependencyLeaseBrand: unique symbol;
/** Capability выдаётся materializer; произвольные поля объекта не подтверждают копию зависимостей. */
export type VerificationDependencyLease = {
  readonly [verificationDependencyLeaseBrand]: true;
};
export type VerificationDependencyState = {
  workspace: string;
  source: string;
  copied: string;
};
/** Host назначает хранилище и границы переносимости; план проверки не получает эти полномочия. */
export type VerificationOptions = {
  storage: { root: string; directory: string };
  signal?: AbortSignal;
  additionalInputs?: string[];
  dependencyLease?: VerificationDependencyLease;
  portability?: "workspace" | "content";
};
export type VerificationProcessResult = {
  status: "passed" | "failed" | "cancelled";
  reason?: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutHash: string;
  stderrHash: string;
  diagnostic: string;
  diagnosticTruncated: boolean;
};
export type VerificationReceipt = {
  version: 1;
  receiptId: string;
  projectId: string;
  taskId: string;
  checkId: string;
  recipeKey: string;
  key: string;
  status: "running" | "passed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  result?: VerificationProcessResult;
  integrity: string;
};
export type VerificationEnvironment = {
  values: NodeJS.ProcessEnv;
  digest: string;
};
export type VerificationRuntime = {
  executable: string;
  prefix: string[];
  digest: string;
};
export type VerificationCheckpoint = {
  digest: string;
  environment: VerificationEnvironment;
  runtime: VerificationRuntime;
};
