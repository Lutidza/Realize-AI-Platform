/**
 * @file .ai/tools/task-workspace/src/cleanup/prepareWorkspaceCleanupPlan.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Подготавливает точный cleanup plan на текущем или будущем состоянии metadata без записи.
 * @see documentation/specifications/task-management-execution.md
 */
import { requireManaged } from "../dossier/Dossier.repository.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { snapshotTree } from "../filesystem/snapshotTree.adapter.mjs";
import { assertWorkspaceCleanupAllowed } from "./assertWorkspaceCleanupAllowed.service.mjs";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { fail } from "../Workspace.error.mjs";
import { assertWorkspaceOutputAvailable } from "../artifacts/assertWorkspaceOutputAvailable.validator.mjs";
/**
 * Проверяет выбранные деревья до первого эффекта; время и requestId предоставляет общий owner операции.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types").WorkspaceDossier} dossier
 * @param {import("../dossier/Dossier.types").WorkspaceArtifactManifest} manifest
 * @param {string[] | undefined} selection
 * @param {string | undefined} output
 * @param {{requestId: string, now: string}} options
 */
export function prepareWorkspaceCleanupPlan(
  storage,
  dossier,
  manifest,
  selection,
  output,
  { requestId, now },
) {
  const meta = requireManaged(dossier);
  if (meta.archivedAt) fail("archived_task_read_only");
  if (manifest.localDossierId !== meta.localDossierId)
    fail("artifact_owner_mismatch");
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
  const file = safeRelative(output ?? `logs/cleanup-plans/${requestId}.json`);
  if (!file.startsWith("logs/") || !file.endsWith(".json"))
    fail("unsafe_plan_output");
  assertWorkspaceOutputAvailable(
    manifest,
    [file, `logs/cleanup-results/${requestId}.json`],
    "cleanup_evidence_registered",
  );
  const items = artifacts.map((artifact) => {
    const coverage = assertWorkspaceCleanupAllowed(storage, dossier, artifact);
    const snapshot = snapshotTree(storage, `${dossier.base}/${artifact.path}`);
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
  const planBody = {
    schemaVersion: /** @type {const} */ (1),
    requestId,
    localKey: meta.localKey,
    localDossierId: meta.localDossierId,
    taskRevision: meta.revision,
    manifestRevision: manifest.revision,
    bodyHash: dossier.bodyHash,
    createdAt: now,
    items,
  };
  const plan = { ...planBody, hash: canonicalHash(planBody) };
  return {
    plan,
    file: `${dossier.base}/${file}`,
    allocatedBytes: items.reduce(
      (sum, item) => sum + item.snapshot.allocatedBytes,
      0,
    ),
  };
}
