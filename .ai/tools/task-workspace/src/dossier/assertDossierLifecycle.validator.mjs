/**
 * @file .ai/tools/task-workspace/src/dossier/assertDossierLifecycle.validator.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Проверяет чистые инварианты результата, приёмки, delivery и quiescence по переданным данным.
 * @see documentation/specifications/task-management-execution.md
 */
import { fail } from "../Workspace.error.mjs";

const busy = new Set([
  "scheduled",
  "queued",
  "dispatching",
  "running",
  "waiting_input",
  "waiting_approval",
  "pause_requested",
  "paused",
  "cancel_requested",
  "publishing_result",
  "recovery_required",
]);
/**
 * Отвергает состояния execution, в которых возможны незавершённые записи.
 * @param {import("./Dossier.types").WorkspaceTask} task
 */
export function requireQuiescent(task) {
  if (task.execution.state !== null && busy.has(task.execution.state))
    fail("execution_not_quiescent");
}
/**
 * Возвращает проверенный указатель результата с актуальными критериями и безопасным расположением.
 * @param {import("./Dossier.types").ManagedWorkspaceDossier} dossier
 */
export function assertResultPointer(dossier) {
  const task = dossier.meta;
  if (!task.result) fail("result_required");
  if (task.result.criteriaHash !== dossier.bodyHash) fail("criteria_changed");
  if (
    !task.result.path.startsWith("logs/results/") ||
    task.result.path.includes("..")
  )
    fail("unsafe_result_path");
  return task.result;
}
/**
 * Проверяет владельца прочитанного результата и обязательные checks.
 * @param {import("./Dossier.types").ManagedWorkspaceDossier} dossier
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceResult} result
 */
export function assertResult(dossier, result) {
  const task = dossier.meta;
  if (!task.result) fail("result_required");
  if (
    result.localDossierId !== task.localDossierId ||
    result.criteriaHash !== dossier.bodyHash ||
    result.revision !== task.result.revision
  )
    fail("result_owner_mismatch");
  for (const id of task.requiredChecks) {
    const check = result.checks.find((c) => c.id === id);
    if (!check || check.status !== "passed") fail("required_check_failed");
  }
}
/**
 * Проверяет приёмку и delivery после проверки результата и quiescence.
 * @param {import("./Dossier.types").ManagedWorkspaceDossier} dossier
 */
export function assertClosed(dossier) {
  const task = dossier.meta;
  if (
    task.acceptance.required &&
    (!task.result ||
      task.acceptance.state !== "accepted" ||
      task.acceptance.resultHash !== task.result.hash ||
      task.acceptance.criteriaHash !== dossier.bodyHash)
  )
    fail("acceptance_required");
  if (task.acceptance.state === "rejected") fail("acceptance_rejected");
  if (
    task.delivery.required &&
    (task.delivery.state !== "completed" || !task.delivery.evidence.length)
  )
    fail("delivery_required");
  if (task.delivery.state === "completed" && !task.delivery.evidence.length)
    fail("delivery_evidence_required");
}
export { busy };
