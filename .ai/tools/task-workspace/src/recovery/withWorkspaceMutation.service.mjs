/**
 * @file .ai/tools/task-workspace/src/recovery/withWorkspaceMutation.service.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Допускает одну мутацию под блокировкой задачи после проверки индекса и конфликтующих операций.
 * @see documentation/specifications/task-management-execution.md
 */
import { acquireWorkspaceFileLock } from "../filesystem/withWorkspaceFileLock.adapter.mjs";
import { safeTaskKey } from "../filesystem/safeTaskKey.validator.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { fail } from "../Workspace.error.mjs";
import { assertLocalWorkspaceOwnership } from "../remote/RemoteWorkspace.repository.mjs";
import { ensureWorkspaceRecoveryIndex } from "./ensureWorkspaceRecoveryIndex.service.mjs";
import {
  safeWorkspaceOperationId,
  workspaceOperationKind,
  copyWorkspaceOperationValue,
  workspaceOperationReference,
  failWorkspaceOperation,
  prepareWorkspaceOperation,
  saveWorkspaceOperation,
  completeWorkspaceOperation,
  readCompletedWorkspaceOperation,
  readWorkspaceOperationState,
  readPendingWorkspaceOperation,
  readLegacyWorkspaceOperation,
  bindLegacyCleanupPlan,
  readWorkspaceLegacyReferences,
  writeWorkspaceLegacyReferences,
  reconcileCompletedWorkspaceOperation,
} from "./WorkspaceOperation.repository.mjs";

/** Контекст живёт лишь во время синхронного callback; сериализация не переносит владение lock.
 * @type {WeakMap<import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs, {key: string, operationId: string, kind: import('./WorkspaceOperation.types.ts').WorkspaceOperationKind, inputHash: string, context: import('./WorkspaceOperation.types.ts').WorkspaceMutationContext}>}
 */
const activeContexts = new WeakMap();

/** @template TResult
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceMutationContext<TResult>} context
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceMutationOptions} options
 * @param {() => TResult} operation @returns {TResult}
 */
export function withWorkspaceActiveContext(
  storage,
  context,
  options,
  operation,
) {
  if (activeContexts.has(storage)) fail("operation_nested_key_conflict");
  activeContexts.set(storage, {
    key: context.key,
    operationId: context.operationId,
    kind: options.kind,
    inputHash: canonicalHash(copyWorkspaceOperationValue(options.input)),
    context,
  });
  try {
    return operation();
  } finally {
    activeContexts.delete(storage);
  }
}

/**
 * Порядок неизменен: индекс → задача; общая блокировка освобождается до прикладного callback.
 * @template TResult
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key @param {() => TResult} operation @returns {TResult}
 */
export function withWorkspaceOperationLock(storage, key, operation) {
  safeTaskKey(key);
  if (activeContexts.has(storage)) fail("operation_nested_key_conflict");
  const releaseIndex = acquireWorkspaceFileLock(
    storage,
    "recovery-index",
    "recovery-index",
  );
  let releaseTask;
  try {
    ensureWorkspaceRecoveryIndex(storage, { lockHeld: true });
    releaseTask = acquireWorkspaceFileLock(storage, key);
  } finally {
    releaseIndex();
  }
  try {
    return operation();
  } finally {
    releaseTask();
  }
}

/**
 * Контекст передаётся вложенным шагам вместо повторной блокировки и отдельного журнала.
 * @template TResult
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceMutationOptions} options
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal | null} pending
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceLegacyOperation | null} legacy
 * @returns {import('./WorkspaceOperation.types.ts').WorkspaceMutationContext<TResult>}
 */
export function createWorkspaceMutationContext(
  storage,
  key,
  options,
  pending,
  legacy,
) {
  const input = copyWorkspaceOperationValue(options.input);
  const inputHash = canonicalHash(input);
  const operationId = safeWorkspaceOperationId(
    options.operationId ?? `${options.kind}-${inputHash}`,
  );
  /** @type {import('./WorkspaceOperation.types.ts').WorkspaceMutationContext<TResult>} */
  const context = {
    key,
    operationId,
    journal: pending,
    legacy,
    prepare(preparation) {
      if (context.journal || context.legacy) fail("operation_already_prepared");
      const journal =
        /** @type {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} */ (
          copyWorkspaceOperationValue({
            schemaVersion: 1,
            operationId,
            key,
            kind: options.kind,
            inputHash,
            input,
            localDossierId: preparation.localDossierId,
            phase: "prepared",
            data: preparation.data,
            ...(Object.hasOwn(preparation, "result")
              ? { result: preparation.result }
              : {}),
          })
        );
      try {
        prepareWorkspaceOperation(storage, journal);
      } catch (error) {
        try {
          const written = readPendingWorkspaceOperation(storage, key);
          if (
            written?.operationId === operationId &&
            written.inputHash === inputHash &&
            written.localDossierId === journal.localDossierId
          )
            context.journal = written;
        } catch {
          /* Исходный отказ записи важнее вторичного отказа диагностического чтения. */
        }
        if (error instanceof Error)
          Object.assign(error, {
            operation: workspaceOperationReference(journal),
          });
        throw error;
      }
      context.journal = journal;
      return journal;
    },
    save() {
      if (!context.journal || context.legacy)
        fail("operation_context_required");
      saveWorkspaceOperation(storage, context.journal);
    },
    complete(result) {
      if (context.legacy) {
        const current = readLegacyWorkspaceOperation(
          storage,
          context.legacy.reference,
        );
        if (!current.reference.completed)
          failWorkspaceOperation("operation_incomplete", current.reference);
        const refs = readWorkspaceLegacyReferences(storage, key);
        writeWorkspaceLegacyReferences(
          storage,
          key,
          refs.map((ref) =>
            ref.operationId === operationId ? current.reference : ref,
          ),
        );
        context.legacy = current;
        return result;
      }
      if (!context.journal) fail("operation_context_required");
      if (context.journal.phase === "completed") {
        if (canonicalHash(context.journal.result) !== canonicalHash(result))
          failWorkspaceOperation(
            "operation_completed_conflict",
            workspaceOperationReference(context.journal),
          );
        return result;
      }
      context.journal = completeWorkspaceOperation(
        storage,
        context.journal,
        result,
      );
      return result;
    },
  };
  return context;
}

/** Сохраняет исходный тип исключения и добавляет безопасную ссылку на уже подготовленную операцию.
 * @param {unknown} error @param {import('./WorkspaceOperation.types.ts').WorkspaceMutationContext} context @returns {never}
 */
export function throwWorkspaceMutationError(error, context) {
  const reference = context.journal
    ? workspaceOperationReference(context.journal)
    : context.legacy?.reference;
  if (reference && error instanceof Error && !Object.hasOwn(error, "operation"))
    Object.assign(error, { operation: reference });
  else if (
    reference &&
    error instanceof Error &&
    /** @type {Error & {operation?: unknown}} */ (error).operation === undefined
  )
    Object.assign(error, { operation: reference });
  throw error;
}

/**
 * Совпавший completed возвращается до callback; любое другое pending блокирует мутацию.
 * @template TResult
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceMutationOptions} options
 * @param {(context: import('./WorkspaceOperation.types.ts').WorkspaceMutationContext<TResult>) => TResult} operation
 * @returns {TResult}
 */
export function withWorkspaceMutation(storage, key, options, operation) {
  workspaceOperationKind(options.kind);
  const input = copyWorkspaceOperationValue(options.input);
  const inputHash = canonicalHash(input);
  const operationId = safeWorkspaceOperationId(
    options.operationId ?? `${options.kind}-${inputHash}`,
  );
  if (options.legacy && options.legacy.operationId !== operationId)
    fail("operation_identity_conflict");
  const active = activeContexts.get(storage);
  if (active) {
    if (active.key !== key) fail("operation_nested_key_conflict");
    const reference = active.context.journal
      ? workspaceOperationReference(active.context.journal)
      : active.context.legacy?.reference;
    if (
      active.operationId !== operationId ||
      active.kind !== options.kind ||
      active.inputHash !== inputHash
    )
      failWorkspaceOperation("operation_recovery_required", reference);
    if (active.context.journal?.phase === "completed") {
      options.checkCompletedIdentity?.(active.context.journal.localDossierId);
      return /** @type {TResult} */ (active.context.journal.result);
    }
    return operation(
      /** @type {import('./WorkspaceOperation.types.ts').WorkspaceMutationContext<TResult>} */ (
        active.context
      ),
    );
  }
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
    if (
      state.pending &&
      (state.pending.kind !== options.kind ||
        state.pending.inputHash !== inputHash)
    )
      failWorkspaceOperation(
        "operation_identity_conflict",
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
      if (completed.kind !== options.kind || completed.inputHash !== inputHash)
        failWorkspaceOperation(
          "operation_identity_conflict",
          workspaceOperationReference(completed),
        );
      options.checkCompletedIdentity?.(completed.localDossierId);
      if (state.pending)
        reconcileCompletedWorkspaceOperation(storage, state.pending, completed);
      return /** @type {TResult} */ (completed.result);
    }
    const legacyRef = state.legacy.find(
      (ref) => ref.operationId === operationId,
    );
    let legacy = legacyRef
      ? readLegacyWorkspaceOperation(storage, legacyRef)
      : null;
    if (legacy && legacy.reference.kind !== options.kind)
      failWorkspaceOperation("operation_identity_conflict", legacy.reference);
    if (legacy?.reference.completed)
      options.checkCompletedIdentity?.(legacy.reference.localDossierId);
    if (legacy && options.legacy)
      legacy = bindLegacyCleanupPlan(storage, key, options.legacy);
    if (legacy?.reference.kind === "cleanup" && !legacy.reference.planPath)
      failWorkspaceOperation("original_plan_required", legacy.reference);
    const context =
      /** @type {import('./WorkspaceOperation.types.ts').WorkspaceMutationContext<TResult>} */ (
        createWorkspaceMutationContext(
          storage,
          key,
          { ...options, operationId, input },
          state.pending,
          legacy,
        )
      );
    return withWorkspaceActiveContext(storage, context, options, () => {
      try {
        const result = operation(context);
        if (context.legacy) return context.complete(result);
        if (context.journal?.phase === "prepared")
          failWorkspaceOperation(
            "operation_incomplete",
            workspaceOperationReference(context.journal),
          );
        return result;
      } catch (error) {
        return throwWorkspaceMutationError(error, context);
      }
    });
  });
}
