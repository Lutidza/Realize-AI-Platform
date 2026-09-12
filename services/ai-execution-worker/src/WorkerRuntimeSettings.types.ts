/**
 * @file services/ai-execution-worker/src/WorkerRuntimeSettings.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт разрешения чтения очередей по текущим настройкам интеграции Codex.
 */

import type { IntegrationRuntimeRepository } from "@realize/payload-ai-control/server/integration-runtime";
import type { ExecutionWorkerConfig } from "./ExecutionWorkerConfig.types";

/** Снимок одной итерации; не содержит credentials и не кэшируется между чтениями БД. */
export type WorkerRuntimeSettings = {
  executionEnabled: boolean;
  previewEnabled: boolean;
  sourcePromotionEnabled: boolean;
  releaseEnabled: boolean;
};

export type ReadWorkerRuntimeSettingsInput = {
  repository: Pick<IntegrationRuntimeRepository, "readPrimaryCodex">;
  config: Pick<
    ExecutionWorkerConfig,
    "sourcePromotionGitCommand" | "releaseOrchestratorCommand"
  >;
};
