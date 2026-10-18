/**
 * @file .ai/tools/task-workspace/src/artifacts/prepareWorkspaceSettlement.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Подготавливает завершённые снимки producer-артефактов без записи metadata.
 * @see documentation/specifications/task-management-execution.md
 */
import { requireManaged } from "../dossier/Dossier.repository.mjs";
import { snapshotTree } from "../filesystem/snapshotTree.adapter.mjs";
import { sameProcessAlive } from "../consumers/readWorkspaceProcesses.adapter.mjs";
import { fail } from "../Workspace.error.mjs";
/**
 * Снимает окончательные деревья на явном состоянии без записи и без изменения аргументов.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types").WorkspaceDossier} dossier
 * @param {import("../dossier/Dossier.types").WorkspaceArtifactManifest} sourceManifest
 * @param {import("./WorkspaceArtifacts.types").WorkspaceArtifactSettlementInput} input
 * @param {{now: string}} options
 */
export function prepareWorkspaceSettlement(
  storage,
  dossier,
  sourceManifest,
  input,
  { now },
) {
  if (
    !input ||
    Object.keys(input).some((name) => name !== "artifactIds") ||
    !Array.isArray(input.artifactIds) ||
    !input.artifactIds.length ||
    input.artifactIds.length > 1024 ||
    new Set(input.artifactIds).size !== input.artifactIds.length
  )
    fail("invalid_settle");
  const meta = structuredClone(requireManaged(dossier));
  if (meta.archivedAt || meta.status.category === "closed")
    fail("reopen_required");
  if (sourceManifest.localDossierId !== meta.localDossierId)
    fail("artifact_owner_mismatch");
  const manifest = structuredClone(sourceManifest);
  for (const id of input.artifactIds) {
    const artifact = manifest.artifacts.find(
      (a) => a.id === id && a.state === "ready",
    );
    if (!artifact) fail("artifact_not_found");
    if (artifact.producer.settled) fail("producer_already_settled");
    if (sameProcessAlive(artifact.producer.pid, artifact.producer.identity))
      fail("producer_active");
    const actual = snapshotTree(storage, `${dossier.base}/${artifact.path}`);
    if (actual.entries[0].kind === "link") fail("symlink_root");
    artifact.hash = actual.hash;
    artifact.bytes = actual.bytes;
    artifact.revision++;
    artifact.producer.settled = true;
  }
  manifest.revision++;
  meta.revision++;
  meta.updatedAt = now;
  return { meta, manifest };
}
