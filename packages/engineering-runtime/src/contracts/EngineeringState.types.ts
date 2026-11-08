/**
 * @file packages/engineering-runtime/src/contracts/EngineeringState.types.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Описывает независимые состояния операции, эффектов, проверок и безопасную ошибку протокола.
 * @see documentation/architecture/engineering-operations.md
 */

/** Состояние координации не подменяет отдельные факты effects/checks/bindings. */
export type OperationState =
  | "planning"
  | "planned"
  | "applying"
  | "checking"
  | "completed"
  | "failed"
  | "conflict"
  | "cancelling"
  | "cancelled"
  | "recovery_required"
  | "reconcile_required"
  | "compensated"
  | "partial_retained";

export type EffectsSummary =
  "none" | "partial" | "applied" | "compensated" | "unknown";
export type ChecksSummary =
  "not_run" | "running" | "passed" | "failed" | "stale" | "incomplete";
export type BindingState =
  "not_required" | "pending" | "satisfied" | "conflict";
export type CancelState =
  "none" | "requested" | "confirmed" | "stop_unconfirmed";
export type WriteBlock = "fs_unresolved" | "writer_unconfirmed" | null;

export type EngineeringErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED"
  | "EXPIRED"
  | "LIMIT_EXCEEDED"
  | "DEPENDENCY_UNAVAILABLE"
  | "CHECK_FAILED"
  | "RECOVERY_REQUIRED"
  | "CANCELLED"
  | "INTERNAL_ERROR";

/** Безопасная ошибка для facade: нет stack, OS paths, credentials или raw objects. */
export interface EngineeringErrorDto {
  code: EngineeringErrorCode;
  message: string;
  retryable: boolean;
  phase: string;
  operationId: string | null;
  detailsRef: string | null;
}
