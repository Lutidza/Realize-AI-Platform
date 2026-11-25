/**
 * @file .ai/tools/worker-assignment/test/checkpoints/CheckpointPilot.types.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Задаёт команду, результат процесса и запись транспорта тестового сценария.
 * @see documentation/specifications/task-management/execution/article-audit-storage-pilot.md
 */
import type { AuditTaskBinding } from "../../src/checkpoints/AuditCheckpoint.types";

export type PilotInput = {
  root: string;
  attemptId: string;
  task: AuditTaskBinding;
};
export type PilotAction = "step" | "first-read" | "crash" | "claim-step";
export type PilotOptions = { revision?: number; ownerId?: string };
export type PilotCommand = PilotInput & {
  action: PilotAction;
  options: PilotOptions;
};
export type ChildResult = {
  pid: number;
  status: string;
  revision?: number;
  error?: string;
  fence?: string;
};
export type JournalRecord = {
  pid: number;
  requestId: string;
  attemptId: string;
  body: string;
};
