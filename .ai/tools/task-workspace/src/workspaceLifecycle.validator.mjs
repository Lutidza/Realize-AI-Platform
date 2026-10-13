/**
 * @file .ai/tools/task-workspace/src/workspaceLifecycle.validator.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет локальные gates результата, приёмки, delivery и quiescence независимо от серверного CRUD.
 * @see documentation/specifications/task-management-execution.md
 */
import { workspaceResultSchema } from "@realize/payload-task-manager/workspace-contracts";
import { hashBytes, snapshotTree } from "./hashWorkspaceTree.adapter.mjs";
import { sameProcessAlive } from "./readWorkspaceProcesses.adapter.mjs";
import { safeRelative } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
const busy = new Set([
  "scheduled",
  "queued",
  "dispatching",
  "running",
  "waiting_input",
  "waiting_approval",
  "pause_requested",
  "paused",
  "cancel_requested",
  "publishing_result",
  "recovery_required",
]);
export function requireQuiescent(task) {
  if (busy.has(task.execution.state)) fail("execution_not_quiescent");
}
export function assertResult(storage, dossier, manifest) {
  const task = dossier.meta;
  if (!task.result) fail("result_required");
  if (task.result.criteriaHash !== dossier.bodyHash) fail("criteria_changed");
  if (
    !task.result.path.startsWith("logs/results/") ||
    task.result.path.includes("..")
  )
    fail("unsafe_result_path");
  const bytes = storage.read(`${dossier.base}/${task.result.path}`);
  if (hashBytes(bytes) !== task.result.hash) fail("result_changed");
  const result = workspaceResultSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  if (
    result.localDossierId !== task.localDossierId ||
    result.criteriaHash !== dossier.bodyHash ||
    result.revision !== task.result.revision
  )
    fail("result_owner_mismatch");
  for (const id of task.requiredChecks) {
    const check = result.checks.find((c) => c.id === id);
    if (!check || check.status !== "passed") fail("required_check_failed");
  }
  for (const ref of result.artifacts) {
    const art = manifest.artifacts.find(
      (a) => a.id === ref.id && a.revision === ref.revision,
    );
    if (
      !art ||
      art.state !== "ready" ||
      art.hash !== ref.hash ||
      art.retention.mode !== "retain"
    )
      fail("result_artifact_not_durable");
    verifyArtifact(storage, dossier, art);
  }
  for (const check of result.checks)
    verifyEvidence(
      storage,
      dossier,
      manifest,
      result.artifacts,
      check.evidence,
    );
  return result;
}
export function assertClosed(storage, dossier, manifest) {
  const task = dossier.meta;
  requireQuiescent(task);
  for (const artifact of manifest.artifacts)
    if (
      artifact.state === "ready" &&
      (!artifact.producer.settled ||
        sameProcessAlive(artifact.producer.pid, artifact.producer.identity))
    )
      fail("producer_active");
  if (task.outcome === "cancelled") return;
  assertResult(storage, dossier, manifest);
  if (
    task.acceptance.required &&
    (task.acceptance.state !== "accepted" ||
      task.acceptance.resultHash !== task.result.hash ||
      task.acceptance.criteriaHash !== dossier.bodyHash)
  )
    fail("acceptance_required");
  if (task.acceptance.state === "rejected") fail("acceptance_rejected");
  if (
    task.delivery.required &&
    (task.delivery.state !== "completed" || !task.delivery.evidence.length)
  )
    fail("delivery_required");
  if (task.delivery.state === "completed" && !task.delivery.evidence.length)
    fail("delivery_evidence_required");
  if (task.delivery.state === "completed")
    for (const evidence of task.delivery.evidence)
      verifyEvidence(storage, dossier, manifest, null, evidence);
}
export { busy };

export function verifyArtifact(storage, dossier, artifact) {
  if (
    artifact.state !== "ready" ||
    artifact.retention.mode !== "retain" ||
    !artifact.producer.settled ||
    sameProcessAlive(artifact.producer.pid, artifact.producer.identity)
  )
    fail("result_artifact_not_durable");
  const actual = snapshotTree(storage, `${dossier.base}/${artifact.path}`);
  if (actual.hash !== artifact.hash || actual.bytes !== artifact.bytes)
    fail("result_artifact_changed");
}
export function verifyEvidence(storage, dossier, manifest, refs, evidence) {
  safeRelative(evidence);
  if (!evidence.startsWith("logs/")) fail("check_evidence_required");
  const artifact = manifest.artifacts.find(
    (a) => a.path === evidence || evidence.startsWith(a.path + "/"),
  );
  if (
    !artifact ||
    (refs &&
      !refs.some(
        (r) =>
          r.id === artifact.id &&
          r.revision === artifact.revision &&
          r.hash === artifact.hash,
      ))
  )
    fail("evidence_not_registered");
  verifyArtifact(storage, dossier, artifact);
  if (!storage.stat(`${dossier.base}/${evidence}`).isFile())
    fail("evidence_file_required");
}
