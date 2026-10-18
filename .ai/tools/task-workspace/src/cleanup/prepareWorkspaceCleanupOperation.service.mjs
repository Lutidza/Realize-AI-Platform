/**
 * @file .ai/tools/task-workspace/src/cleanup/prepareWorkspaceCleanupOperation.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Готовит полный журнал очистки и окончательные metadata до первого переноса.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  readDossier,
  requireManaged,
  readArtifacts,
  serializeDossier,
} from "../dossier/Dossier.repository.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { safeTaskKey } from "../filesystem/safeTaskKey.validator.mjs";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { snapshotTree } from "../filesystem/snapshotTree.adapter.mjs";
import { assertWorkspaceCleanupAllowed } from "./assertWorkspaceCleanupAllowed.service.mjs";
import { assertWorkspaceOutputAvailable } from "../artifacts/assertWorkspaceOutputAvailable.validator.mjs";
import { runtimeRoot } from "../workspacePaths.config.mjs";
import { fail } from "../Workspace.error.mjs";

/** Проверяет подпись и конечный набор exact trees, включая вызовы без CLI.
 * @param {import('./WorkspaceCleanup.types.ts').WorkspaceCleanupPlan} plan
 */
export function validateWorkspaceCleanupPlan(plan) {
  if (!plan || typeof plan !== "object") fail("cleanup_plan_invalid");
  const { hash, ...body } = plan;
  if (
    plan.schemaVersion !== 1 ||
    canonicalHash(body) !== hash ||
    !Array.isArray(plan.items) ||
    !plan.items.length ||
    plan.items.length > 1024 ||
    !/^[a-f0-9-]{36}$/.test(plan.requestId) ||
    new Set(plan.items.map((i) => i.artifactId)).size !== plan.items.length ||
    new Set(plan.items.map((i) => i.path)).size !== plan.items.length
  )
    fail("cleanup_plan_invalid");
  safeTaskKey(plan.localKey);
  for (const item of plan.items) {
    safeRelative(item.path);
    if (!/^[a-f0-9-]{36}$/.test(item.artifactId)) fail("cleanup_plan_invalid");
    if (
      plan.items.some(
        (other) => other !== item && other.path.startsWith(item.path + "/"),
      )
    )
      fail("overlapping_cleanup");
  }
}

/** JSON-выходы используют тот же формат, что WorkspaceFs.writeJson. @param {unknown} value */
export const cleanupJson = (value) => JSON.stringify(value, null, 2) + "\n";

/** Overrides нужны producer-finalize для подготовки всех фаз до записи settle.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./WorkspaceCleanup.types.ts').WorkspaceCleanupPlan} plan
 * @param {string} planPath
 * @param {{dossier?: import('../dossier/Dossier.types.ts').WorkspaceDossier, manifest?: import('../dossier/Dossier.types.ts').WorkspaceArtifactManifest}} [options]
 * @returns {import('./WorkspaceCleanup.types.ts').WorkspaceCleanupOperation}
 */
export function prepareWorkspaceCleanupOperation(
  storage,
  plan,
  planPath,
  options = {},
) {
  validateWorkspaceCleanupPlan(plan);
  safeRelative(planPath);
  const dossier = options.dossier ?? readDossier(storage, plan.localKey);
  const meta = requireManaged(dossier);
  const manifest = options.manifest ?? readArtifacts(storage, dossier);
  if (
    meta.localDossierId !== plan.localDossierId ||
    meta.revision !== plan.taskRevision ||
    manifest.revision !== plan.manifestRevision ||
    dossier.bodyHash !== plan.bodyHash
  )
    fail("cleanup_revision_conflict");
  const receiptPath = `logs/cleanup-results/${plan.requestId}.json`;
  assertWorkspaceOutputAvailable(
    manifest,
    [receiptPath],
    "cleanup_evidence_registered",
  );
  if (storage.exists(`${dossier.base}/${receiptPath}`))
    fail("cleanup_receipt_exists");
  for (const item of plan.items) {
    const artifact = manifest.artifacts.find(
      (a) =>
        a.id === item.artifactId &&
        a.revision === item.artifactRevision &&
        a.path === item.path,
    );
    if (!artifact || artifact.hash !== item.snapshot.hash)
      fail("cleanup_owner_mismatch");
    assertWorkspaceCleanupAllowed(storage, dossier, artifact);
    if (
      canonicalHash(snapshotTree(storage, `${dossier.base}/${item.path}`)) !==
      canonicalHash(item.snapshot)
    )
      fail("artifact_changed");
  }
  const now = new Date().toISOString();
  const manifestAfter = structuredClone(manifest);
  manifestAfter.revision++;
  for (const item of plan.items) {
    const artifact = manifestAfter.artifacts.find(
      (a) => a.id === item.artifactId,
    );
    if (!artifact) fail("cleanup_owner_mismatch");
    artifact.state = "deleted";
  }
  const taskAfter = { ...meta, revision: meta.revision + 1, updatedAt: now };
  /** @type {import('./WorkspaceCleanup.types.ts').WorkspaceCleanupReceipt} */
  const result = {
    requestId: plan.requestId,
    status: "completed",
    paths: plan.items.map((i) => i.path),
    estimatedAllocatedBytes: plan.items.reduce(
      (sum, i) => sum + i.snapshot.allocatedBytes,
      0,
    ),
    completedAt: now,
  };
  const writes = [
    {
      path: `${dossier.base}/artifact-manifest.json`,
      before: options.manifest
        ? cleanupJson(manifest)
        : storage
            .read(`${dossier.base}/artifact-manifest.json`)
            .toString("utf8"),
      after: cleanupJson(manifestAfter),
    },
    {
      path: `${dossier.base}/TASK.md`,
      before: options.dossier
        ? serializeDossier(meta, dossier.body)
        : storage.read(`${dossier.base}/TASK.md`).toString("utf8"),
      after: serializeDossier(taskAfter, dossier.body),
    },
    {
      path: `${dossier.base}/${receiptPath}`,
      before: null,
      after: cleanupJson(result),
    },
  ];
  return {
    phase: "prepared",
    requestId: plan.requestId,
    planPath,
    planHash: plan.hash,
    localDossierId: plan.localDossierId,
    base: dossier.base,
    bodyHash: dossier.bodyHash,
    taskBefore: meta,
    manifestBefore: manifest,
    taskAfter,
    manifestAfter,
    writes,
    result,
    items: plan.items.map((item) => ({
      ...item,
      phase: "prepared",
      quarantine: `${runtimeRoot}/quarantine/${plan.requestId}/${item.artifactId}`,
    })),
  };
}
