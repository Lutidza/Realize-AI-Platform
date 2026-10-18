/**
 * @file .ai/tools/task-workspace/src/artifacts/verifyWorkspaceEvidence.service.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Сверяет файлы evidence с зарегистрированными неизменяемыми артефактами и состоянием producer.
 * @see documentation/specifications/task-management-execution.md
 */
import { workspaceResultSchema } from "@realize/payload-task-manager/workspace-contracts";
import { hashBytes } from "../filesystem/canonicalHash.util.mjs";
import {
  assertResultPointer,
  assertResult,
  assertClosed,
  requireQuiescent,
} from "../dossier/assertDossierLifecycle.validator.mjs";
import { withWorkspaceEvidencePhase } from "./withWorkspaceEvidencePhase.service.mjs";
import { sameProcessAlive } from "../consumers/readWorkspaceProcesses.adapter.mjs";
import { fail } from "../Workspace.error.mjs";
/**
 * Сверяет завершённый retained artifact с физическим снимком.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types").WorkspaceDossier} dossier
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact} artifact
 * @param {import("./WorkspaceEvidence.types.ts").WorkspaceEvidencePhase} [phase]
 */
export function verifyArtifact(storage, dossier, artifact, phase) {
  if (!phase)
    return withWorkspaceEvidencePhase(storage, dossier, (current) =>
      current.verifyArtifact(artifact),
    );
  phase.assertContext(storage, dossier);
  phase.verifyArtifact(artifact);
}

/**
 * Проверяет принадлежность evidence артефакту и его неизменность.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types").WorkspaceDossier} dossier
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifactManifest} manifest
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceResultArtifact[] | null} refs
 * @param {string} evidence
 * @param {import("./WorkspaceEvidence.types.ts").WorkspaceEvidencePhase} [phase]
 */
export function verifyEvidence(
  storage,
  dossier,
  manifest,
  refs,
  evidence,
  phase,
) {
  if (!phase)
    return withWorkspaceEvidencePhase(storage, dossier, (current) =>
      current.verifyEvidence(manifest, refs, evidence),
    );
  phase.assertContext(storage, dossier);
  phase.verifyEvidence(manifest, refs, evidence);
}

/**
 * Читает результат и сверяет артефакты и evidence в одной неизменной фазе.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types").ManagedWorkspaceDossier} dossier
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifactManifest} manifest
 * @param {import("./WorkspaceEvidence.types.ts").WorkspaceEvidencePhase} [phase]
 * @returns {import("@realize/payload-task-manager/workspace-contracts").WorkspaceResult}
 */
export function verifyWorkspaceResult(storage, dossier, manifest, phase) {
  if (!phase)
    return withWorkspaceEvidencePhase(storage, dossier, (current) =>
      verifyWorkspaceResult(storage, dossier, manifest, current),
    );
  phase.assertContext(storage, dossier);
  const pointer = assertResultPointer(dossier);
  const bytes = storage.read(`${dossier.base}/${pointer.path}`);
  if (hashBytes(bytes) !== pointer.hash) fail("result_changed");
  const result = workspaceResultSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  assertResult(dossier, result);
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
    verifyArtifact(storage, dossier, art, phase);
  }
  for (const check of result.checks)
    verifyEvidence(
      storage,
      dossier,
      manifest,
      result.artifacts,
      check.evidence,
      phase,
    );
  return result;
}
/**
 * Проверяет producers, результат, приёмку и delivery перед закрытием.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types").ManagedWorkspaceDossier} dossier
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifactManifest} manifest
 * @param {import("./WorkspaceEvidence.types.ts").WorkspaceEvidencePhase} [phase]
 * @returns {void}
 */
export function verifyWorkspaceClosure(storage, dossier, manifest, phase) {
  if (!phase)
    return withWorkspaceEvidencePhase(storage, dossier, (current) =>
      verifyWorkspaceClosure(storage, dossier, manifest, current),
    );
  phase.assertContext(storage, dossier);
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
  verifyWorkspaceResult(storage, dossier, manifest, phase);
  assertClosed(dossier);
  if (task.delivery.state === "completed")
    for (const evidence of task.delivery.evidence)
      verifyEvidence(storage, dossier, manifest, null, evidence, phase);
}
