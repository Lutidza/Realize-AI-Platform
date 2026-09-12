/**
 * @file packages/ai-contracts/src/CodexAgentDiagnostics.types.ts
 * @version 2.0.0
 * @date 2026-09-11
 * @description Задаёт безопасный снимок состояния и разрешений административного агента.
 * @see documentation/architecture/codex-integration.md
 */

import type { WorkerAvailabilityDTO } from "./WorkerAvailability.types";
import type { RuntimeStatusDTO } from "./api";
import type { CodexAuthMode } from "./CodexIntegration.types";

/** Разрешение общих настроек не подтверждает работу worker или approval конкретного изменения. */
export type CodexAgentOperationDiagnosticsDTO = {
  state: "allowed" | "disabled" | "blocked";
  reason: string;
};

/** Диагностика только для integration manager, без credentials и инфраструктурных адресов. */
export type CodexAgentDiagnosticsDTO = {
  checkedAt: string;
  runtime: RuntimeStatusDTO;
  connection: {
    connectionKey: string;
    displayName: string;
    revision: number;
    authMode: CodexAuthMode;
  } | null;
  /** Пустая model означает выбор провайдера; пустая reviewModel наследует основную. */
  models: { model: string; reviewModel: string };
  /** Только последняя сохранённая проверка авторизации, не проверка генерации или worker. */
  accessTest: {
    status: "never" | "passed" | "failed";
    checkedAt?: string;
  };
  operations: Record<
    "execution" | "preview" | "sourcePromotion" | "release",
    CodexAgentOperationDiagnosticsDTO
  >;
  worker: WorkerAvailabilityDTO;
};
