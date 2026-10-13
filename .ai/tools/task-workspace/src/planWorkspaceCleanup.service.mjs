/**
 * @file .ai/tools/task-workspace/src/planWorkspaceCleanup.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Готовит exact cleanup plan для disposable артефактов с hashes, revision guards и consumer checks.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withWorkspaceLock } from "./withWorkspaceLock.adapter.mjs";
import {
  readDossier,
  requireManaged,
  readArtifacts,
} from "./Dossier.repository.mjs";
import { requireQuiescent } from "./workspaceLifecycle.validator.mjs";
import { snapshotTree, canonicalHash } from "./hashWorkspaceTree.adapter.mjs";
import { sourceReferences } from "./readWorkspaceReferences.adapter.mjs";
import {
  sameProcessAlive,
  processReferences,
} from "./readWorkspaceProcesses.adapter.mjs";
import { safeRelative } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
export function cleanupGuards(storage, dossier, artifact) {
  requireQuiescent(dossier.meta);
  if (
    artifact.category !== "temporary" ||
    artifact.retention.mode !== "temporary" ||
    artifact.retention.pinned ||
    artifact.retention.keepReason ||
    artifact.retention.referencedBy.length ||
    !artifact.producer.settled
  )
    fail("artifact_retained");
  if (!artifact.path.startsWith("tmp/")) fail("protected_artifact_path");
  safeRelative(artifact.path);
  if (sameProcessAlive(artifact.producer.pid, artifact.producer.identity))
    fail("producer_active");
  const relative = `${dossier.base}/${artifact.path}`;
  const refs = sourceReferences(storage, relative);
  if (refs.length) fail("source_reference_active");
  const proc = processReferences(path.join(storage.root, relative));
  if (proc.references.length) fail("process_reference_active");
  return proc;
}
export function planWorkspaceCleanup(
  storage,
  key,
  expectedRevision,
  selection,
  output,
) {
  return withWorkspaceLock(storage, key, () => {
    const dossier = readDossier(storage, key);
    requireManaged(dossier, expectedRevision);
    if (dossier.meta.archivedAt) fail("archived_task_read_only");
    const manifest = readArtifacts(storage, dossier);
    if (
      selection !== undefined &&
      (!Array.isArray(selection) ||
        selection.some((p) => typeof p !== "string") ||
        new Set(selection).size !== selection.length)
    )
      fail("invalid_selection");
    const artifacts = manifest.artifacts.filter(
      (a) =>
        a.state === "ready" &&
        (selection ? selection.includes(a.path) : a.category === "temporary"),
    );
    if (selection && artifacts.length !== selection.length)
      fail("selection_not_registered");
    if (!artifacts.length) fail("empty_cleanup");
    const items = artifacts.map((artifact) => {
      const coverage = cleanupGuards(storage, dossier, artifact);
      const snapshot = snapshotTree(
        storage,
        `${dossier.base}/${artifact.path}`,
      );
      if (
        snapshot.entries[0].kind === "link" ||
        snapshot.hash !== artifact.hash ||
        snapshot.bytes !== artifact.bytes
      )
        fail("artifact_changed");
      return {
        artifactId: artifact.id,
        artifactRevision: artifact.revision,
        path: artifact.path,
        snapshot,
        coverage,
      };
    });
    for (const a of items)
      for (const b of items)
        if (a !== b && b.path.startsWith(a.path + "/"))
          fail("overlapping_cleanup");
    const plan = {
      schemaVersion: 1,
      requestId: randomUUID(),
      localKey: key,
      localDossierId: dossier.meta.localDossierId,
      taskRevision: dossier.meta.revision,
      manifestRevision: manifest.revision,
      bodyHash: dossier.bodyHash,
      createdAt: new Date().toISOString(),
      items,
    };
    plan.hash = canonicalHash(plan);
    const file = safeRelative(
      output ?? `logs/cleanup-plans/${plan.requestId}.json`,
    );
    if (!file.startsWith("logs/") || !file.endsWith(".json"))
      fail("unsafe_plan_output");
    storage.writeJson(`${dossier.base}/${file}`, plan, true);
    return {
      plan,
      file: `${dossier.base}/${file}`,
      allocatedBytes: items.reduce(
        (sum, i) => sum + i.snapshot.allocatedBytes,
        0,
      ),
    };
  });
}
