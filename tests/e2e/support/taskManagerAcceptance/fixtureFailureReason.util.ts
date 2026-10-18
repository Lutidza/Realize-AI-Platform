/**
 * @file tests/e2e/support/taskManagerAcceptance/fixtureFailureReason.util.ts
 * @version 1.0.0
 * @date 2026-10-15
 * @description Выбирает безопасный машинный код отказа фикстуры без содержимого входов и секретов.
 * @see documentation/specifications/task-management-execution.md
 */
/** Workspace-коды сохраняются вместе с прежними машинными причинами ресурсов. */
export function fixtureFailureReason(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[a-zA-Z0-9_]{1,96}$/.test(error.code)
  )
    return error.code;
  if (error instanceof Error && error.name === "ZodError")
    return "invalid_contract";
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_]{1,96}$/.test(message)
    ? message
    : "TASK_BROWSER_FIXTURE_FAILED";
}
