/**
 * @file services/ai-execution-worker/src/ExecutionWorkerConfig.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Описывает серверную инфраструктуру execution worker без продуктовых переключателей.
 */

/** Полностью проверенная process configuration одного worker instance. */
export type ExecutionWorkerConfig = {
  codexBinary?: string;
  databaseURL: string;
  integrationEncryptionKey?: string;
  pollIntervalMs: number;
  previewHost: "127.0.0.1";
  previewPortMax: number;
  previewPortMin: number;
  previewRoot: string;
  previewStartupTimeoutMs: number;
  promotionWorkspaceRoot: string;
  releaseOrchestratorArgs: string[];
  releaseOrchestratorCommand?: string;
  releaseOrchestratorEnvironment: NodeJS.ProcessEnv;
  releaseTimeoutMs: number;
  repositoryRoot: string;
  reviewTimeoutMs: number;
  signingSecret: string;
  sourcePromotionGitCommand?: string;
  sourcePromotionTimeoutMs: number;
  turnTimeoutMs: number;
  workerID: string;
  workspaceRoot: string;
};
