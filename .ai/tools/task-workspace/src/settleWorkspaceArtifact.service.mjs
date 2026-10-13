/**
 * @file .ai/tools/task-workspace/src/settleWorkspaceArtifact.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Завершает зарегистрированный producer после его остановки и закрепляет окончательный snapshot.
 * @see documentation/specifications/task-management-execution.md
 */
import { withWorkspaceLock } from "./withWorkspaceLock.adapter.mjs";
import {
  readDossier,
  requireManaged,
  readArtifacts,
  writeArtifacts,
  writeDossier,
} from "./Dossier.repository.mjs";
import { snapshotTree } from "./hashWorkspaceTree.adapter.mjs";
import { sameProcessAlive } from "./readWorkspaceProcesses.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
export function settleWorkspaceArtifacts(
  storage,
  key,
  expectedRevision,
  input,
) {
  if (
    !input ||
    Object.keys(input).some((k) => k !== "artifactIds") ||
    !Array.isArray(input.artifactIds) ||
    !input.artifactIds.length ||
    input.artifactIds.length > 1024 ||
    new Set(input.artifactIds).size !== input.artifactIds.length
  )
    fail("invalid_settle");
  return withWorkspaceLock(storage, key, () => {
    const dossier = readDossier(storage, key);
    const meta = structuredClone(requireManaged(dossier, expectedRevision));
    if (meta.archivedAt || meta.status.category === "closed")
      fail("reopen_required");
    const manifest = readArtifacts(storage, dossier);
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
    writeArtifacts(storage, dossier, manifest);
    meta.revision++;
    meta.updatedAt = new Date().toISOString();
    return writeDossier(storage, dossier, meta).meta;
  });
}
