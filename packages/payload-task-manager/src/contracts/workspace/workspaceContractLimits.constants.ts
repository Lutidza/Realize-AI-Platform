/**
 * @file packages/payload-task-manager/src/contracts/workspace/workspaceContractLimits.constants.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Ограничивает размер локальных контрактов и перечисляет проецируемые состояния исполнения.
 * @see documentation/specifications/task-management-execution.md
 */

export const WORKSPACE_CONTRACT_LIMITS = {
  metadataId: 128,
  localKey: 128,
  title: 240,
  path: 1024,
  summary: 8000,
  evidence: 2048,
  artifacts: 1024,
  checks: 128,
  references: 128,
} as const;

// Эти значения описывают наблюдение runtime owner, а не команды его управления.
export const WORKSPACE_EXECUTION_STATES = [
  "draft",
  "ready",
  "blocked",
  "scheduled",
  "queued",
  "dispatching",
  "running",
  "waiting_input",
  "waiting_approval",
  "pause_requested",
  "paused",
  "cancel_requested",
  "cancelled",
  "publishing_result",
  "succeeded",
  "failed",
  "recovery_required",
] as const;
