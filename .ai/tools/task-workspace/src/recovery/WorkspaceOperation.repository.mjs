/**
 * @file .ai/tools/task-workspace/src/recovery/WorkspaceOperation.repository.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Хранит авторитетные журналы, неизменяемые итоги и связи прежних операций.
 * @see documentation/specifications/task-management-execution.md
 */
import { runtimeRoot } from "../workspacePaths.config.mjs";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { safeTaskKey } from "../filesystem/safeTaskKey.validator.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { WorkspaceError, fail } from "../Workspace.error.mjs";

export const WORKSPACE_OPERATION_MAX_BYTES = 64 * 1024 * 1024;
export const WORKSPACE_RECOVERY_INDEX_PATH = `${runtimeRoot}/recovery/index.json`;
export const WORKSPACE_LEGACY_LIMIT = 10000;
const KINDS = new Set([
  "create",
  "adopt",
  "status",
  "register",
  "settle",
  "result",
  "plan-cleanup",
  "cleanup",
  "archive",
  "reopen",
  "producer-begin",
  "producer-finalize",
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isWorkspaceRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {string} */
export function safeWorkspaceOperationId(value) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/.test(value)
  )
    fail("operation_id_invalid");
  return value;
}

/** @param {unknown} value @returns {import('./WorkspaceOperation.types.ts').WorkspaceOperationKind} */
export function workspaceOperationKind(value) {
  if (typeof value !== "string" || !KINDS.has(value))
    fail("operation_kind_unknown");
  return /** @type {import('./WorkspaceOperation.types.ts').WorkspaceOperationKind} */ (
    value
  );
}

/** JSON-копия отделяет вход от объекта вызывающей стороны и запрещает несохраняемые значения.
 * @param {unknown} value @returns {unknown}
 */
export function copyWorkspaceOperationValue(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value, (_key, item) => {
      if (["function", "symbol", "bigint"].includes(typeof item))
        fail("operation_value_invalid");
      if (typeof item === "number" && !Number.isFinite(item))
        fail("operation_value_invalid");
      return item;
    });
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    fail("operation_value_invalid");
  }
  if (
    serialized === undefined ||
    Buffer.byteLength(serialized) > WORKSPACE_OPERATION_MAX_BYTES
  )
    fail("operation_value_invalid");
  return JSON.parse(serialized);
}

/** @param {string} key @param {string} [operationId] */
export function workspaceOperationPaths(key, operationId) {
  safeTaskKey(key);
  const base = `${runtimeRoot}/operations/${key}`;
  return {
    pending: `${base}/pending.json`,
    completed: operationId
      ? `${base}/completed/${safeWorkspaceOperationId(operationId)}.json`
      : null,
    legacy: `${runtimeRoot}/recovery/legacy/${key}.json`,
  };
}

/** @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} journal */
export function workspaceOperationReference(journal) {
  const cleanup = isWorkspaceRecord(journal.data.cleanup)
    ? journal.data.cleanup
    : null;
  const ownerPhase = [
    journal.data.cleanup,
    journal.data.move,
    journal.data.producer,
  ]
    .filter(isWorkspaceRecord)
    .find((data) => typeof data.phase === "string")?.phase;
  return {
    operationId: journal.operationId,
    key: journal.key,
    kind: journal.kind,
    phase: journal.phase,
    path:
      journal.phase === "completed"
        ? /** @type {string} */ (
            workspaceOperationPaths(journal.key, journal.operationId).completed
          )
        : workspaceOperationPaths(journal.key).pending,
    ...(typeof ownerPhase === "string" ? { ownerPhase } : {}),
    ...(typeof cleanup?.planPath === "string"
      ? { planPath: cleanup.planPath }
      : {}),
    ...(typeof cleanup?.planHash === "string"
      ? { planHash: cleanup.planHash }
      : {}),
    ...(typeof cleanup?.requestId === "string"
      ? { requestId: cleanup.requestId }
      : {}),
  };
}

/** @param {string} code @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationReference} [reference] @returns {never} */
export function failWorkspaceOperation(code, reference) {
  const error = new WorkspaceError(code);
  error.operation = reference;
  throw error;
}

/** @param {unknown} value @param {string} key @param {string} [operationId] @returns {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} */
export function validateWorkspaceOperation(value, key, operationId) {
  if (
    !isWorkspaceRecord(value) ||
    value.schemaVersion !== 1 ||
    value.key !== key ||
    typeof value.localDossierId !== "string" ||
    !value.localDossierId ||
    typeof value.inputHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.inputHash) ||
    !isWorkspaceRecord(value.data) ||
    !["prepared", "completed"].includes(String(value.phase)) ||
    !Object.hasOwn(value, "input") ||
    value.inputHash !== canonicalHash(value.input)
  )
    fail("operation_journal_invalid");
  safeTaskKey(value.key);
  safeWorkspaceOperationId(value.operationId);
  workspaceOperationKind(value.kind);
  if (operationId && value.operationId !== operationId)
    fail("operation_identity_conflict");
  if (value.phase === "completed" && !Object.hasOwn(value, "result"))
    fail("operation_journal_invalid");
  return /** @type {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} */ (
    value
  );
}

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} file */
function readOptional(storage, file) {
  return storage.exists(file)
    ? storage.json(file, WORKSPACE_OPERATION_MAX_BYTES)
    : undefined;
}

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} key */
export function readPendingWorkspaceOperation(storage, key) {
  const value = readOptional(storage, workspaceOperationPaths(key).pending);
  if (value === undefined) return null;
  const journal = validateWorkspaceOperation(value, key);
  if (journal.phase !== "prepared")
    failWorkspaceOperation(
      "operation_phase_invalid",
      workspaceOperationReference(journal),
    );
  return journal;
}

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} key @param {string} operationId */
export function readCompletedWorkspaceOperation(storage, key, operationId) {
  const value = readOptional(
    storage,
    /** @type {string} */ (workspaceOperationPaths(key, operationId).completed),
  );
  if (value === undefined) return null;
  const journal = validateWorkspaceOperation(value, key, operationId);
  if (journal.phase !== "completed")
    failWorkspaceOperation(
      "operation_journal_invalid",
      workspaceOperationReference(journal),
    );
  return journal;
}

/** @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} left @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} right */
function sameIdentity(left, right) {
  return (
    left.operationId === right.operationId &&
    left.key === right.key &&
    left.kind === right.kind &&
    left.inputHash === right.inputHash &&
    left.localDossierId === right.localDossierId
  );
}

/** Сохраняет полный prepared до первого эффекта, без замены чужой операции.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} journal
 */
export function prepareWorkspaceOperation(storage, journal) {
  validateWorkspaceOperation(journal, journal.key, journal.operationId);
  if (journal.phase !== "prepared") fail("operation_phase_invalid");
  const completed = readCompletedWorkspaceOperation(
    storage,
    journal.key,
    journal.operationId,
  );
  if (completed)
    failWorkspaceOperation(
      "operation_identity_conflict",
      workspaceOperationReference(completed),
    );
  storage.writeJson(
    workspaceOperationPaths(journal.key).pending,
    copyWorkspaceOperationValue(journal),
    true,
  );
}

/** Обновляет только принадлежащий контексту незавершённый журнал.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} journal
 */
export function saveWorkspaceOperation(storage, journal) {
  validateWorkspaceOperation(journal, journal.key, journal.operationId);
  const current = readPendingWorkspaceOperation(storage, journal.key);
  if (
    !current ||
    !sameIdentity(current, journal) ||
    current.phase !== "prepared" ||
    journal.phase !== "prepared"
  )
    failWorkspaceOperation(
      "operation_identity_conflict",
      workspaceOperationReference(journal),
    );
  storage.writeJson(
    workspaceOperationPaths(journal.key).pending,
    copyWorkspaceOperationValue(journal),
  );
}

/** Сначала сохраняет неизменяемый completed, затем снимает pending с fsync родителя.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} journal
 * @param {unknown} result
 */
export function completeWorkspaceOperation(storage, journal, result) {
  const completed = validateWorkspaceOperation(
    copyWorkspaceOperationValue({ ...journal, phase: "completed", result }),
    journal.key,
    journal.operationId,
  );
  const previous = readCompletedWorkspaceOperation(
    storage,
    journal.key,
    journal.operationId,
  );
  const pending = readPendingWorkspaceOperation(storage, journal.key);
  if (!pending || !sameIdentity(pending, journal))
    failWorkspaceOperation(
      "operation_identity_conflict",
      workspaceOperationReference(journal),
    );
  if (previous) {
    if (canonicalHash(previous) !== canonicalHash(completed))
      failWorkspaceOperation(
        "operation_completed_conflict",
        workspaceOperationReference(previous),
      );
  } else {
    const finalPending = { ...completed, phase: "prepared" };
    if (canonicalHash(pending) !== canonicalHash(finalPending))
      storage.writeJson(
        workspaceOperationPaths(journal.key).pending,
        finalPending,
      );
    const destination = /** @type {string} */ (
      workspaceOperationPaths(journal.key, journal.operationId).completed
    );
    const staged = `${runtimeRoot}/operations/${journal.key}/.${journal.operationId}.completed`;
    if (storage.exists(staged)) {
      if (
        canonicalHash(storage.json(staged, WORKSPACE_OPERATION_MAX_BYTES)) !==
        canonicalHash(completed)
      )
        failWorkspaceOperation(
          "operation_completed_conflict",
          workspaceOperationReference(journal),
        );
    } else storage.writeJson(staged, completed);
    storage.renameNoReplace(staged, destination);
  }
  storage.unlink(workspaceOperationPaths(journal.key).pending);
  return completed;
}

/** Сверяет единственный допустимый хвост прерывания между completed и unlink pending.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} pending
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceOperationJournal} completed
 */
export function reconcileCompletedWorkspaceOperation(
  storage,
  pending,
  completed,
) {
  if (
    !sameIdentity(pending, completed) ||
    canonicalHash({
      ...pending,
      phase: "completed",
      result: completed.result,
    }) !== canonicalHash(completed)
  )
    failWorkspaceOperation(
      "operation_completed_conflict",
      workspaceOperationReference(pending),
    );
  storage.unlink(workspaceOperationPaths(pending.key).pending);
}

/** Валидирует исходный формат старого журнала; индекс не заменяет его фазы.
 * @param {unknown} value @param {string} file
 * @returns {import('./WorkspaceOperation.types.ts').WorkspaceLegacyOperation}
 */
export function inspectLegacyWorkspaceOperation(value, file) {
  if (!isWorkspaceRecord(value)) fail("legacy_operation_invalid");
  const filename = file.split("/").at(-1) ?? "";
  if (
    file !== `${runtimeRoot}/operations/${filename}` ||
    !filename.endsWith(".json")
  )
    fail("legacy_operation_invalid");
  const operationId = safeWorkspaceOperationId(filename.slice(0, -5));
  const key = safeTaskKey(value.key);
  const kind = workspaceOperationKind(value.kind);
  let identity;
  if (kind === "cleanup") {
    if (
      value.schemaVersion !== 1 ||
      !/^[a-f0-9-]{36}$/.test(operationId) ||
      !["prepared", "publishing", "completed"].includes(String(value.phase)) ||
      typeof value.planHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.planHash) ||
      !isWorkspaceRecord(value.taskBefore) ||
      !isWorkspaceRecord(value.manifestBefore) ||
      !Array.isArray(value.items) ||
      !value.items.length ||
      value.items.length > 1024 ||
      value.items.some(
        (item) =>
          !isWorkspaceRecord(item) ||
          ![
            "prepared",
            "renaming",
            "quarantined",
            "purging",
            "completed",
          ].includes(String(item.phase)),
      )
    )
      fail("legacy_operation_invalid");
    identity = value.taskBefore;
    if (value.manifestBefore.localDossierId !== identity.localDossierId)
      fail("legacy_operation_invalid");
  } else if (kind === "archive" || kind === "reopen") {
    if (
      (value.schemaVersion !== undefined && value.schemaVersion !== 1) ||
      !["prepared", "moving", "publishing", "completed"].includes(
        String(value.phase),
      ) ||
      !isWorkspaceRecord(value.before) ||
      !isWorkspaceRecord(value.after) ||
      value.after.localDossierId !== value.before.localDossierId ||
      typeof value.before.revision !== "number" ||
      value.after.revision !== value.before.revision + 1 ||
      operationId !== `${key}-${kind}-${value.before.revision}` ||
      value.destination !==
        `.ai-workspace/${kind === "archive" ? "history" : "tasks"}/${key}` ||
      !(
        kind === "archive"
          ? [`.ai-workspace/tasks/${key}`]
          : [`.ai-workspace/tasks/${key}`, `.ai-workspace/history/${key}`]
      ).includes(String(value.source))
    )
      fail("legacy_operation_invalid");
    identity = value.before;
  } else fail("legacy_operation_invalid");
  if (
    identity.localKey !== key ||
    typeof identity.localDossierId !== "string" ||
    !identity.localDossierId
  )
    fail("legacy_operation_invalid");
  const reference = {
    operationId,
    key,
    kind,
    phase: String(value.phase),
    path: file,
    legacy: /** @type {const} */ (true),
    completed: value.phase === "completed",
    localDossierId: identity.localDossierId,
    ...(kind === "cleanup"
      ? { planHash: /** @type {string} */ (value.planHash) }
      : {}),
  };
  return { reference, journal: value };
}

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} key @returns {import('./WorkspaceOperation.types.ts').WorkspaceLegacyReference[]} */
export function readWorkspaceLegacyReferences(storage, key) {
  const value = readOptional(storage, workspaceOperationPaths(key).legacy);
  if (value === undefined) return [];
  if (
    !isWorkspaceRecord(value) ||
    value.schemaVersion !== 1 ||
    value.key !== key ||
    !Array.isArray(value.operations) ||
    value.operations.length > WORKSPACE_LEGACY_LIMIT
  )
    fail("recovery_index_invalid");
  for (const ref of value.operations) {
    if (
      !isWorkspaceRecord(ref) ||
      ref.key !== key ||
      ref.legacy !== true ||
      typeof ref.completed !== "boolean" ||
      typeof ref.localDossierId !== "string" ||
      !ref.localDossierId ||
      typeof ref.phase !== "string" ||
      ref.completed !== (ref.phase === "completed") ||
      !(
        ref.kind === "cleanup"
          ? ["prepared", "publishing", "completed"]
          : ["prepared", "moving", "publishing", "completed"]
      ).includes(ref.phase) ||
      !["cleanup", "archive", "reopen"].includes(String(ref.kind)) ||
      (ref.kind === "cleanup" &&
        (typeof ref.planHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(ref.planHash))) ||
      ref.path !==
        `${runtimeRoot}/operations/${safeWorkspaceOperationId(ref.operationId)}.json` ||
      (ref.planPath !== undefined &&
        safeRelative(ref.planPath) !== ref.planPath)
    )
      fail("recovery_index_invalid");
  }
  if (
    new Set(value.operations.map((ref) => ref.operationId)).size !==
    value.operations.length
  )
    fail("recovery_index_invalid");
  return /** @type {import('./WorkspaceOperation.types.ts').WorkspaceLegacyReference[]} */ (
    value.operations
  );
}

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} key @param {import('./WorkspaceOperation.types.ts').WorkspaceLegacyReference[]} operations */
export function writeWorkspaceLegacyReferences(storage, key, operations) {
  storage.writeJson(workspaceOperationPaths(key).legacy, {
    schemaVersion: 1,
    key,
    operations,
  });
}

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {import('./WorkspaceOperation.types.ts').WorkspaceLegacyReference} reference */
export function readLegacyWorkspaceOperation(storage, reference) {
  const current = inspectLegacyWorkspaceOperation(
    storage.json(reference.path, WORKSPACE_OPERATION_MAX_BYTES),
    reference.path,
  );
  if (
    current.reference.key !== reference.key ||
    current.reference.kind !== reference.kind ||
    current.reference.localDossierId !== reference.localDossierId ||
    current.reference.planHash !== reference.planHash
  )
    failWorkspaceOperation("legacy_operation_conflict", reference);
  current.reference = {
    ...current.reference,
    ...(reference.planPath ? { planPath: reference.planPath } : {}),
  };
  return current;
}

/** Обычный вызов читает только pending и связи нужного ключа; чужие журналы не обходятся.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} key
 */
export function readWorkspaceOperationState(storage, key) {
  const pending = readPendingWorkspaceOperation(storage, key);
  const legacy = readWorkspaceLegacyReferences(storage, key).map((reference) =>
    reference.completed
      ? reference
      : readLegacyWorkspaceOperation(storage, reference).reference,
  );
  return { pending, legacy };
}

/** Привязывает только предоставленный исходный план, без поиска по logs и изменения старого журнала.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} key
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceLegacyCleanupBinding} binding
 */
export function bindLegacyCleanupPlan(storage, key, binding) {
  const refs = readWorkspaceLegacyReferences(storage, key);
  const reference = refs.find(
    (item) => item.operationId === binding.operationId,
  );
  if (!reference || reference.kind !== "cleanup")
    fail("legacy_operation_not_found");
  const current = readLegacyWorkspaceOperation(storage, reference);
  const planPath = safeRelative(binding.planPath);
  const plan = storage.json(planPath, WORKSPACE_OPERATION_MAX_BYTES);
  if (!isWorkspaceRecord(plan))
    failWorkspaceOperation("original_plan_required", reference);
  const { hash, ...body } = plan;
  if (
    plan.requestId !== reference.operationId ||
    plan.localKey !== key ||
    plan.localDossierId !== reference.localDossierId ||
    binding.localDossierId !== reference.localDossierId ||
    hash !== reference.planHash ||
    hash !== binding.planHash ||
    canonicalHash(body) !== hash ||
    (reference.planPath && reference.planPath !== planPath)
  )
    failWorkspaceOperation("legacy_cleanup_plan_conflict", reference);
  const bound = { ...current.reference, planPath };
  writeWorkspaceLegacyReferences(
    storage,
    key,
    refs.map((item) =>
      item.operationId === binding.operationId ? bound : item,
    ),
  );
  return { reference: bound, journal: current.journal };
}
