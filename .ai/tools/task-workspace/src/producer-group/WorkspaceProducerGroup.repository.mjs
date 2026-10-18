/**
 * @file .ai/tools/task-workspace/src/producer-group/WorkspaceProducerGroup.repository.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Хранит process-local привязки producer-групп и читает их актуальные записи из досье.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  readDossier,
  requireManaged,
  readArtifacts,
} from "../dossier/Dossier.repository.mjs";
import { readProducerFinalizationProgress } from "./readProducerFinalizationProgress.service.mjs";
import { fail } from "../Workspace.error.mjs";
import {
  assertProducerDossier,
  assertProducerGroupOwner,
  assertWorkspaceProducerGroup,
} from "./assertWorkspaceProducerGroup.validator.mjs";

/** @type {WeakMap<import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup, import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupBinding>} */
const groups = new WeakMap();

/**
 * Читает только process-local привязку, чтобы повторить известную операцию до проверки изменённых metadata.
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupBinding}
 */
export function readProducerGroupBinding(group) {
  const binding = groups.get(group);
  if (!binding) fail("producer_group_unbound");
  return binding;
}

/**
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {number} [expectedRevision]
 * @returns {import("../dossier/Dossier.types.ts").ManagedWorkspaceDossier}
 */
export function requireProducerDossier(storage, key, expectedRevision) {
  const dossier = readDossier(storage, key);
  const meta =
    expectedRevision === undefined
      ? requireManaged(dossier)
      : requireManaged(dossier, expectedRevision);
  const managed = { ...dossier, meta };
  assertProducerDossier(managed, key);
  return managed;
}

/**
 * Handle и списки путей заморожены; изменяемая привязка доступна только в текущем процессе.
 * @param {import("../dossier/Dossier.types.ts").ManagedWorkspaceDossier} dossier
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupInput} input
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact[]} artifacts
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup}
 */
export function bindProducerGroup(dossier, input, artifacts) {
  const group = Object.freeze({
    localKey: dossier.meta.localKey,
    localDossierId: dossier.meta.localDossierId,
    stageId: input.stageId ?? null,
    attemptId: input.attemptId ?? null,
    artifactIds: Object.freeze(artifacts.map((artifact) => artifact.id)),
    paths: Object.freeze(artifacts.map((artifact) => artifact.path)),
  });
  groups.set(group, {
    requests: new Map(),
    artifacts: artifacts.map((artifact) => structuredClone(artifact)),
  });
  return group;
}

/**
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 * @param {number} [expectedRevision]
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupContext}
 */
export function requireProducerGroup(storage, group, expectedRevision) {
  const binding = readProducerGroupBinding(group);
  const dossier = requireProducerDossier(
    storage,
    group.localKey,
    expectedRevision,
  );
  assertProducerGroupOwner(dossier, group);
  const manifest = readArtifacts(storage, dossier);
  const artifacts = assertWorkspaceProducerGroup(binding, manifest);
  return { dossier, manifest, artifacts, binding };
}

/**
 * Обновляет только собственные записи по сверенным сохранённым данным операции.
 * Ни общий revision, ни историческая квитанция сами по себе не обновляют binding.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 * @param {string} operationId
 */
export function refreshProducerGroupFromOperation(storage, group, operationId) {
  const binding = readProducerGroupBinding(group);
  const progress = readProducerFinalizationProgress(
    storage,
    group,
    operationId,
  );
  if (progress.settlement === "settled" && progress.artifacts)
    binding.artifacts = progress.artifacts.map((artifact) =>
      structuredClone(artifact),
    );
  return progress;
}

/**
 * Запоминает ссылку до продолжения effects; outcome остаётся только в исходном журнале.
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupBinding} binding
 * @param {string} requestHash
 * @param {import("../recovery/WorkspaceOperation.types.ts").WorkspaceOperationReference} operation
 */
export function rememberProducerOperation(binding, requestHash, operation) {
  binding.requests.set(requestHash, operation);
  binding.operation = operation;
}

/**
 * Новая мутация и completed replay сверяют последний собственный сохранённый переход,
 * затем обычную привязку; чужие общие revisions не входят в lifetime binding.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 */
export function requireConfirmedProducerGroup(storage, group) {
  const binding = readProducerGroupBinding(group);
  if (binding.operation) {
    const progress = refreshProducerGroupFromOperation(
      storage,
      group,
      binding.operation.operationId,
    );
    if (progress.settlement !== "settled" || !progress.artifacts)
      fail("producer_group_metadata_changed");
  }
  return requireProducerGroup(storage, group);
}
