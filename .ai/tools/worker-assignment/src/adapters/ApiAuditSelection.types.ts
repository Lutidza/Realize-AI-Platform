/**
 * @file .ai/tools/worker-assignment/src/adapters/ApiAuditSelection.types.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Задаёт привязку и выбранную оркестратором модель для проверки API-назначения.
 */
export type ApiAuditSelection = {
  lockPath: string;
  contextId: string;
  model: string;
};
