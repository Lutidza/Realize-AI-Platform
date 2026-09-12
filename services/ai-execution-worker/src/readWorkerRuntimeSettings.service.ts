/**
 * @file services/ai-execution-worker/src/readWorkerRuntimeSettings.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Читает разрешения очередей из актуальной интеграции без аренды или расшифровки credentials.
 * @see documentation/architecture/codex-integration.md
 */

import { parseCodexIntegrationConfiguration } from "@realize/ai-contracts";
import type {
  ReadWorkerRuntimeSettingsInput,
  WorkerRuntimeSettings,
} from "./WorkerRuntimeSettings.types";

const DISABLED: WorkerRuntimeSettings = {
  executionEnabled: false,
  previewEnabled: false,
  sourcePromotionEnabled: false,
  releaseEnabled: false,
};

/** Ошибки чтения или конфигурации запрещают claim; авторизацию модели проверяет владелец lease. */
export const readWorkerRuntimeSettings = async (
  input: ReadWorkerRuntimeSettingsInput,
): Promise<WorkerRuntimeSettings> => {
  try {
    const row = await input.repository.readPrimaryCodex();
    if (
      !row ||
      row.provider !== "codex" ||
      row.connection_key !== "codex:primary" ||
      row.enabled !== true ||
      !Number.isSafeInteger(Number(row.revision)) ||
      Number(row.revision) < 1
    )
      return { ...DISABLED };
    const { authMode, agent } = parseCodexIntegrationConfiguration(
      row.configuration,
    );
    if (
      authMode === "workloadIdentity"
        ? row.credential_envelope != null
        : typeof row.credential_envelope !== "string" ||
          !row.credential_envelope
    )
      return { ...DISABLED };
    return {
      executionEnabled: agent.execution.enabled,
      previewEnabled: agent.execution.enabled && agent.preview.enabled,
      sourcePromotionEnabled:
        agent.sourcePromotion.enabled &&
        Boolean(input.config.sourcePromotionGitCommand),
      releaseEnabled:
        agent.release.enabled &&
        Boolean(input.config.releaseOrchestratorCommand),
    };
  } catch {
    // Повторное чтение следующей итерации позволяет восстановиться без перезапуска.
    return { ...DISABLED };
  }
};
