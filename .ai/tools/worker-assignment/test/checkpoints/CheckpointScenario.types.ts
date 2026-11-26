/**
 * @file .ai/tools/worker-assignment/test/checkpoints/CheckpointScenario.types.ts
 * @version 2.0.2
 * @date 2026-11-26
 * @description Задаёт команду, результат процесса и запись транспорта тестового сценария.
 * @see documentation/specifications/task-management/execution/checkpoint-storage.md
 */
import type { TestContext } from "node:test";
import type { z } from "zod";
import type { ApiAuditSelection } from "../../src/adapters/ApiAuditSelection.types";
import type { BoundAssignment } from "../../src/admission/AssignmentAdmission.types";
import type { AuditTaskBinding } from "../../src/checkpoints/AuditCheckpoint.types";
import type { createAuditCheckpointState } from "../../src/checkpoints/createAuditCheckpointState.service";
import type { assignmentLockSchema } from "../../src/validateAssignmentDefinition.validator";

export type CheckpointSimulatorScript = {
  reads: readonly {
    callId: string;
    path: string;
    startLine: number;
    lineCount: number;
  }[];
  report: string;
};

export type CheckpointAuditContext = ApiAuditSelection & {
  root: string;
  policy: Parameters<typeof createAuditCheckpointState>[0];
  lock: Pick<z.infer<typeof assignmentLockSchema>, "files" | "manifestSha256">;
  result: BoundAssignment;
};

export type CheckpointProcessInput = {
  root: string;
  attemptId: string;
  task: AuditTaskBinding;
  simulator: CheckpointSimulatorScript;
};
export type CheckpointAuditInput = Omit<CheckpointProcessInput, "root"> & {
  prepareContext: (t: TestContext) => Promise<CheckpointAuditContext>;
};
export type CheckpointProcessAction = "step" | "first-read" | "crash" | "claim-step";
export type CheckpointProcessOptions = { revision?: number; ownerId?: string };
export type CheckpointProcessCommand = CheckpointProcessInput & {
  action: CheckpointProcessAction;
  options: CheckpointProcessOptions;
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
