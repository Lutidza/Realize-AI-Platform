/**
 * @file .ai/tools/worker-assignment/src/checkpoints/AuditCheckpoint.types.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Описывает восстанавливаемое состояние попытки аудита и его связь со снимком задачи.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import type { AdmissionTarget } from "../admission/AssignmentAdmission.types";
import type { ApiAuditSelection } from "../adapters/ApiAuditSelection.types";
import type {
  AuditCallKey,
  AuditOperation,
} from "../exchange/SingleRead.types";
import type { AuditAssistantCall } from "../exchange/singleReadMessages.schemas";
import type { AuditTaskBinding } from "@realize/payload-task-manager/audit-review";

export type { AuditTaskBinding } from "@realize/payload-task-manager/audit-review";

export type AuditCheckpointIdentity = {
  task: AuditTaskBinding;
  selection: ApiAuditSelection;
  executor: AdmissionTarget;
  policyRevision: number;
  assignmentId: string;
  revision: number;
  lockSha256: string;
  inputSha256: string;
  scopePins: Record<string, string>;
  rework?: { actorId: string; workId: string; inputSha256: string };
};

export type PendingAuditCall = {
  key: AuditCallKey;
  assistant: AuditAssistantCall;
};
export type PreparedAuditEntry = PendingAuditCall & { resultSha256: string };
export type AuditHistoryEntry = PreparedAuditEntry & {
  delivery: { requestId: string; operationSha256: string };
};
type RequestIntent = {
  requestId: string;
  bodySha256: string;
  read: { entry: PreparedAuditEntry; operation: AuditOperation } | null;
};

/** История содержит подтверждённые пары. Результат в намерении ещё не доставлен. */
export type AuditCheckpointState = {
  schemaVersion: 1;
  identity: AuditCheckpointIdentity;
  history: AuditHistoryEntry[];
} & (
  | { status: "ready" }
  | { status: "pending"; pending: PendingAuditCall }
  | { status: "sending"; intent: RequestIntent }
  | {
      status: "delivery_unknown";
      requestId: string;
      taskState: "recovery_required";
    }
  | { status: "blocked"; reason: string }
  | { status: "received"; report: { text: string; sha256: string } }
);
