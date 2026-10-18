/**
 * @file .ai/tools/task-workspace/src/producer-group/assertWorkspaceProducerGroup.validator.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Проверяет владельца producer-группы и неизменность её зарегистрированных записей без обращения к хранилищу.
 * @see documentation/specifications/task-management-execution.md
 */
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { fail } from "../Workspace.error.mjs";

/**
 * @param {import("../dossier/Dossier.types.ts").ManagedWorkspaceDossier} dossier
 * @param {string} key
 */
export function assertProducerDossier(dossier, key) {
  if (
    dossier.meta.archivedAt ||
    dossier.base !== `.ai-workspace/tasks/${key}` ||
    !["open", "active", "done"].includes(dossier.meta.status.category)
  )
    fail("reopen_required");
}

/**
 * @param {import("../dossier/Dossier.types.ts").ManagedWorkspaceDossier} dossier
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 */
export function assertProducerGroupOwner(dossier, group) {
  if (dossier.meta.localDossierId !== group.localDossierId)
    fail("producer_group_owner_mismatch");
}

/**
 * Retention может получить новых consumers; удержание проверяется владельцем очистки.
 * До новой finalize-операции все поля, кроме retention, совпадают с исходным begin.
 * @param {Pick<import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupBinding, "artifacts">} binding
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifactManifest} manifest
 * @returns {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact[]}
 */
export function assertWorkspaceProducerGroup(binding, manifest) {
  return binding.artifacts.map((bound) => {
    const current = manifest.artifacts.find(
      (artifact) => artifact.id === bound.id,
    );
    if (
      !current ||
      canonicalHash(comparableMetadata(current)) !==
        canonicalHash(comparableMetadata(bound))
    )
      fail("producer_group_metadata_changed");
    return current;
  });
}

/**
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact} artifact
 */
function comparableMetadata(artifact) {
  return { ...artifact, retention: undefined };
}

/**
 * Сохранённый переход обязан покрывать ровно исходные IDs и paths handle; пустой subset не подтверждает группу.
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact[]} artifacts
 */
export function assertProducerArtifactSet(group, artifacts) {
  if (
    !Array.isArray(group.artifactIds) ||
    !group.artifactIds.length ||
    group.artifactIds.length > 1024 ||
    !Array.isArray(group.paths) ||
    group.paths.length !== group.artifactIds.length ||
    new Set(group.artifactIds).size !== group.artifactIds.length ||
    !Array.isArray(artifacts) ||
    artifacts.some((artifact) => !artifact || typeof artifact !== "object") ||
    artifacts.length !== group.artifactIds.length ||
    new Set(artifacts.map((artifact) => artifact.id)).size !==
      group.artifactIds.length ||
    artifacts.some((artifact) => {
      const index = group.artifactIds.indexOf(artifact.id);
      return index < 0 || artifact.path !== group.paths[index];
    })
  )
    fail("producer_operation_invalid");
}
