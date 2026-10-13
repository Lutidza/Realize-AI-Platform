/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureDatabaseCreateOutcome.validator.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Различает подтверждённый отказ CREATE DATABASE и неизвестный исход transport/server termination.
 * @see documentation/specifications/task-management-execution.md
 */
/** Только конкретные admission/syntax ошибки server ERROR доказывают отказ без CREATE. */
export function isDefiniteFixtureCreateRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const response = error as { severity?: unknown; code?: unknown };
  return (
    response.severity === "ERROR" &&
    typeof response.code === "string" &&
    ["42P04", "42501", "42601", "22023", "0A000"].includes(response.code)
  );
}
