/**
 * @file .ai/tools/worker-assignment/src/checkpoints/Checkpoint.types.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Описывает снимок попытки, право записи и квитанцию подтверждённой доставки.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import type { AuditOperation } from "../exchange/SingleRead.types";
import type { AuditCheckpointState } from "./AuditCheckpoint.types";

export interface CheckpointSnapshot {
  attemptId: string;
  revision: number;
  state: AuditCheckpointState;
}

/** PostgreSQL выдаёт bigint как строку, чтобы старший fencing token не терял точность. */
export interface CheckpointLease {
  attemptId: string;
  ownerId: string;
  fence: string;
}

/** requestId относится к подтверждённой отправке, operation.key.requestId — к исходному вызову. */
export interface ConfirmedRead {
  requestId: string;
  operation: AuditOperation;
}
