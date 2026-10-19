/**
 * @file .ai/tools/task-workspace/src/remote/deliverRemoteWorkspaceTask.service.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Передаёт владение задачей через durable outbox, освобождая файловые locks до HTTP.
 * @see documentation/specifications/task-management-execution.md
 */
import { selectRemoteWorkspaceContext } from "./selectRemoteWorkspaceContext.validator.mjs";
import { remoteWorkspaceTargetSchema } from "./remoteWorkspaceRecord.validator.mjs";
import { randomUUID } from "node:crypto";
import { WorkspaceError, fail } from "../Workspace.error.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { withWorkspaceOperationLock } from "../recovery/withWorkspaceMutation.service.mjs";
import { readWorkspaceOperationState } from "../recovery/WorkspaceOperation.repository.mjs";
import {
  readDossier,
  readArtifacts,
  requireManaged,
} from "../dossier/Dossier.repository.mjs";
import { requireQuiescent } from "../dossier/assertDossierLifecycle.validator.mjs";
import { sameProcessAlive } from "../consumers/readWorkspaceProcesses.adapter.mjs";
import {
  readRemoteWorkspaceRecord,
  writeRemoteWorkspaceRecord,
} from "./RemoteWorkspace.repository.mjs";
import { buildRemoteWorkspacePayload } from "./buildRemoteWorkspacePayload.mapper.mjs";
import {
  probeRemoteWorkspace,
  sendRemoteWorkspaceTask,
} from "./sendRemoteWorkspaceTask.adapter.mjs";

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} key */
export function readOptionalWorkspaceDossier(storage, key) {
  try {
    return readDossier(storage, key);
  } catch (error) {
    if (error instanceof WorkspaceError && error.code === "task_not_found")
      return null;
    throw error;
  }
}

/** Незавершённая локальная транзакция сначала восстанавливается штатным recover.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} key
 */
function assertLocalOperationSettled(storage, key) {
  const state = readWorkspaceOperationState(storage, key);
  if (state.pending || state.legacy.some((entry) => !entry.completed))
    fail("operation_recovery_required");
}

/** Handoff не должен лишить живого producer возможности завершить settlement.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('../dossier/Dossier.types').WorkspaceDossier | null} dossier
 */
function assertPromotionQuiescent(storage, dossier) {
  if (!dossier) return;
  const meta = requireManaged(dossier);
  try {
    requireQuiescent(meta);
  } catch (error) {
    if (
      error instanceof WorkspaceError &&
      error.code === "execution_not_quiescent"
    )
      fail(
        "remote_sync_deferred_active_work",
        "Передача отложена до завершения execution и producers.",
      );
    throw error;
  }
  if (
    readArtifacts(storage, dossier).artifacts.some(
      (artifact) =>
        artifact.state === "ready" &&
        (!artifact.producer.settled ||
          sameProcessAlive(artifact.producer.pid, artifact.producer.identity)),
    )
  )
    fail(
      "remote_sync_deferred_active_work",
      "Передача отложена до завершения execution и producers.",
    );
}

/** Создаёт только routing record; существующие досье принимаются исключительно через явный sync.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 * @param {import('../dossier/Dossier.types').CreateWorkspaceDossierInput} [input]
 * @param {{projectId?:string,listId?:string,baseUrl?:string}} [requested]
 */
export function queueRemoteWorkspaceTask(storage, key, input, requested = {}) {
  return withWorkspaceOperationLock(storage, key, () => {
    const existing = readRemoteWorkspaceRecord(storage, key);
    const createHash = input ? canonicalHash(input) : null;
    if (existing) {
      if (input && existing.createHash !== createHash)
        fail(
          "remote_create_conflict",
          "Повтор create должен содержать прежние неизменённые поля.",
        );
      const selection = selectRemoteWorkspaceContext(
        existing.selection,
        requested,
      );
      if (canonicalHash(selection) !== canonicalHash(existing.selection)) {
        const next = { ...existing, selection };
        writeRemoteWorkspaceRecord(storage, next);
        return next;
      }
      return existing;
    }
    assertLocalOperationSettled(storage, key);
    const dossier = readOptionalWorkspaceDossier(storage, key);
    if (input && dossier)
      fail(
        "dossier_exists",
        "Существующее досье передаётся явной командой sync.",
      );
    if (!input && !dossier?.meta)
      fail(dossier ? "legacy_requires_adoption" : "task_not_found");
    /** @type {import('./RemoteWorkspace.types').RemoteWorkspaceRecord} */
    const record = {
      schemaVersion: 2,
      selection: selectRemoteWorkspaceContext(null, requested),
      key,
      clientTaskId: dossier?.meta?.localDossierId ?? randomUUID(),
      phase: "queued",
      dispatches: 0,
      createHash,
      target: null,
      payload: null,
      snapshot: null,
      taskRef: null,
      reason: "not_configured",
    };
    writeRemoteWorkspaceRecord(storage, record);
    return record;
  });
}

/**
 * Резервирует immutable POST под lock; каждый конкурентный dispatch учитывается до отправки.
 * Известный отказ первой попытки можно вернуть в queued, если других попыток не было.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 * @param {import('./RemoteWorkspace.types').RemoteWorkspaceTarget} target
 * @param {import('../dossier/Dossier.types').CreateWorkspaceDossierInput | undefined} input
 */
function prepareRemoteWorkspaceDispatch(storage, key, target, input) {
  return withWorkspaceOperationLock(storage, key, () => {
    const current = readRemoteWorkspaceRecord(storage, key);
    if (!current) fail("remote_journal_missing");
    const selection = selectRemoteWorkspaceContext(current.selection, target);
    if (current.phase === "remote") return current;
    if (current.phase === "pending") {
      if (canonicalHash(current.target) !== canonicalHash(target))
        fail("remote_target_conflict");
      const next = { ...current, dispatches: current.dispatches + 1 };
      writeRemoteWorkspaceRecord(storage, next);
      return next;
    }
    assertLocalOperationSettled(storage, key);
    const dossier = readOptionalWorkspaceDossier(storage, key);
    if (dossier && !dossier.meta) fail("legacy_requires_adoption");
    assertPromotionQuiescent(storage, dossier);
    const payload = buildRemoteWorkspacePayload(
      target,
      current.clientTaskId,
      input,
      dossier,
    );
    /** @type {import('./RemoteWorkspace.types').RemoteWorkspaceRecord} */
    const next = {
      ...current,
      phase: "pending",
      dispatches: 1,
      target,
      selection,
      payload,
      reason: null,
      snapshot: dossier?.meta
        ? {
            localDossierId: dossier.meta.localDossierId,
            revision: dossier.meta.revision,
            documentHash: dossier.documentHash,
          }
        : null,
    };
    writeRemoteWorkspaceRecord(storage, next);
    return next;
  });
}

/** GET preflight никогда не ослабляет ранее pending запись; POST всегда вне синхронного lock.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 * @param {import('./RemoteWorkspace.types').RemoteWorkspaceConfig} config
 * @param {{input?:import('../dossier/Dossier.types').CreateWorkspaceDossierInput,transport?:import('./RemoteWorkspace.types').RemoteWorkspaceTransport,preflight?:import('./RemoteWorkspace.types').RemoteWorkspacePreflight}} [options]
 * @returns {Promise<{record:import('./RemoteWorkspace.types').RemoteWorkspaceRecord,task?:import('@realize/payload-task-manager/contracts').TaskDto}>}
 */
export async function deliverRemoteWorkspaceTask(
  storage,
  key,
  config,
  options = {},
) {
  let current = readRemoteWorkspaceRecord(storage, key);
  if (!current) fail("remote_journal_missing");
  selectRemoteWorkspaceContext(current.selection, { baseUrl: config?.baseUrl });
  if (current.phase === "remote") return { record: current };
  if (!config) {
    if (current.phase === "pending")
      fail(
        "remote_sync_pending",
        "Для повтора незавершённого POST требуется прежняя настройка Task Manager.",
      );
    return { record: current };
  }
  let target = current.target;
  const clientTaskId = current.clientTaskId;
  if (current.phase === "queued") {
    const selection = selectRemoteWorkspaceContext(current.selection, {
      baseUrl: config.baseUrl,
    });
    if (!selection)
      fail(
        "remote_selection_required",
        "Выберите проект командой sync --project UUID.",
      );
    // Проверка payload до сети не допускает fallback из-за validation error.
    withWorkspaceOperationLock(storage, key, () => {
      assertLocalOperationSettled(storage, key);
      const dossier = readOptionalWorkspaceDossier(storage, key);
      assertPromotionQuiescent(storage, dossier);
      buildRemoteWorkspacePayload(
        {
          baseUrl: config.baseUrl,
          projectId: selection.projectId,
          listId: selection.listId ?? "00000000-0000-4000-8000-000000000000",
        },
        clientTaskId,
        options.input,
        dossier,
      );
    });
    const probe = await (options.preflight ?? probeRemoteWorkspace)(
      config,
      selection,
    );
    if (probe.kind !== "ready") {
      current = withWorkspaceOperationLock(storage, key, () => {
        const record = readRemoteWorkspaceRecord(storage, key);
        if (!record) fail("remote_journal_missing");
        if (record.phase !== "queued") return record;
        const next = { ...record, reason: probe.reason };
        writeRemoteWorkspaceRecord(storage, next);
        return next;
      });
      if (current.phase === "remote") return { record: current };
      if (current.phase === "pending") fail("remote_sync_pending");
      if (probe.kind === "rejected")
        fail(
          probe.reason ?? "remote_preflight_rejected",
          "Task Manager отклонил проверку подключения; локальный fallback не разрешён.",
        );
      return { record: current };
    }
    const parsedTarget = remoteWorkspaceTargetSchema.safeParse(probe.target);
    if (!parsedTarget.success) fail("remote_contract_invalid");
    target = parsedTarget.data;
    selectRemoteWorkspaceContext(selection, target);
  }
  if (!target) fail("remote_journal_invalid");
  const prepared = prepareRemoteWorkspaceDispatch(
    storage,
    key,
    target,
    options.input,
  );
  if (prepared.phase === "remote") return { record: prepared };
  if (!prepared.payload) fail("remote_journal_invalid");
  const response = await (options.transport ?? sendRemoteWorkspaceTask)(
    config,
    prepared.payload,
  );
  const record = withWorkspaceOperationLock(storage, key, () => {
    const latest = readRemoteWorkspaceRecord(storage, key);
    if (
      !latest ||
      latest.clientTaskId !== prepared.clientTaskId ||
      canonicalHash(latest.payload) !== canonicalHash(prepared.payload)
    )
      fail("remote_journal_conflict");
    if (latest.phase === "remote") return latest;
    if (response.kind === "success") {
      const task = response.data.task;
      const dossier = latest.snapshot
        ? readOptionalWorkspaceDossier(storage, key)
        : null;
      const changed =
        latest.snapshot &&
        dossier?.documentHash !== latest.snapshot.documentHash;
      /** @type {import('./RemoteWorkspace.types').RemoteWorkspaceRecord} */
      const next = {
        ...latest,
        phase: "remote",
        taskRef: {
          id: task.id,
          revision: task.revision,
          projectId: task.projectId,
          listId: task.listId,
        },
        reason: changed ? "local_snapshot_changed" : null,
      };
      writeRemoteWorkspaceRecord(storage, next);
      return next;
    }
    // Другой dispatch мог создать задачу: его существование запрещает downgrade даже при ECONNREFUSED.
    const canFallback =
      response.kind === "unavailable" &&
      latest.dispatches === 1 &&
      prepared.dispatches === 1;
    /** @type {import('./RemoteWorkspace.types').RemoteWorkspaceRecord} */
    const next = {
      ...latest,
      phase: canFallback ? "queued" : "pending",
      reason: response.reason,
      ...(canFallback
        ? { dispatches: 0, payload: null, target: null, snapshot: null }
        : {}),
    };
    writeRemoteWorkspaceRecord(storage, next);
    return next;
  });
  if (record.phase === "pending")
    fail(
      response.kind === "rejected" ? response.reason : "remote_sync_pending",
      "Результат отправки не подтверждён; повторите sync. Локальная запись заблокирована.",
    );
  return {
    record,
    ...(response.kind === "success" ? { task: response.data.task } : {}),
  };
}
