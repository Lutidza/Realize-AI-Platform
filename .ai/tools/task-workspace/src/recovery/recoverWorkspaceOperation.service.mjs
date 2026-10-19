/**
 * @file .ai/tools/task-workspace/src/recovery/recoverWorkspaceOperation.service.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Продолжает известную сохранённую операцию через конечный набор переданных обработчиков.
 * @see documentation/specifications/task-management-execution.md
 */
import { assertLocalWorkspaceOwnership } from "../remote/RemoteWorkspace.repository.mjs";
import {
  safeWorkspaceOperationId,
  readWorkspaceOperationState,
  readCompletedWorkspaceOperation,
  workspaceOperationReference,
  failWorkspaceOperation,
  readLegacyWorkspaceOperation,
  reconcileCompletedWorkspaceOperation,
} from "./WorkspaceOperation.repository.mjs";
import {
  withWorkspaceOperationLock,
  withWorkspaceActiveContext,
  createWorkspaceMutationContext,
  throwWorkspaceMutationError,
} from "./withWorkspaceMutation.service.mjs";

/**
 * Обработчики передаются композицией; верхние сервисы не импортируются владельцем recovery.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key @param {string} operationId
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceRecoveryHandlers} handlers
 * @param {(localDossierId: string) => void} [checkCompletedIdentity]
 */
export function recoverWorkspaceOperation(
  storage,
  key,
  operationId,
  handlers,
  checkCompletedIdentity,
) {
  safeWorkspaceOperationId(operationId);
  return withWorkspaceOperationLock(storage, key, () => {
    assertLocalWorkspaceOwnership(storage, key);
    const state = readWorkspaceOperationState(storage, key);
    const activeLegacy = state.legacy.filter((ref) => !ref.completed);
    if (activeLegacy.length > 1 || (state.pending && activeLegacy.length))
      failWorkspaceOperation(
        "operation_conflict",
        state.pending
          ? workspaceOperationReference(state.pending)
          : activeLegacy[0],
      );
    if (state.pending && state.pending.operationId !== operationId)
      failWorkspaceOperation(
        "operation_recovery_required",
        workspaceOperationReference(state.pending),
      );
    if (activeLegacy.length && activeLegacy[0].operationId !== operationId)
      failWorkspaceOperation("operation_recovery_required", activeLegacy[0]);
    const completed = readCompletedWorkspaceOperation(
      storage,
      key,
      operationId,
    );
    if (completed) {
      checkCompletedIdentity?.(completed.localDossierId);
      if (state.pending)
        reconcileCompletedWorkspaceOperation(storage, state.pending, completed);
      return completed.result;
    }
    const legacyRef = state.legacy.find(
      (ref) => ref.operationId === operationId,
    );
    const legacy = legacyRef
      ? readLegacyWorkspaceOperation(storage, legacyRef)
      : null;
    if (legacy?.reference.completed)
      checkCompletedIdentity?.(legacy.reference.localDossierId);
    if (!state.pending && !legacy)
      failWorkspaceOperation("operation_not_found");
    if (legacy?.reference.kind === "cleanup" && !legacy.reference.planPath)
      failWorkspaceOperation("original_plan_required", legacy.reference);
    const pending = state.pending;
    const kind =
      pending?.kind ??
      /** @type {NonNullable<typeof legacy>} */ (legacy).reference.kind;
    const reference = pending
      ? workspaceOperationReference(pending)
      : /** @type {NonNullable<typeof legacy>} */ (legacy).reference;
    const handler = Object.hasOwn(handlers, kind) ? handlers[kind] : undefined;
    if (typeof handler !== "function")
      failWorkspaceOperation("operation_handler_unavailable", reference);
    const context = createWorkspaceMutationContext(
      storage,
      key,
      { kind, operationId, input: pending?.input ?? {} },
      pending,
      legacy,
    );
    return withWorkspaceActiveContext(
      storage,
      context,
      { kind, operationId, input: pending?.input ?? {} },
      () => {
        try {
          const result = handler(storage, context);
          if (context.journal?.phase === "completed") return result;
          return context.complete(result);
        } catch (error) {
          return throwWorkspaceMutationError(error, context);
        }
      },
    );
  });
}
