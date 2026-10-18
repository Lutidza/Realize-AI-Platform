/**
 * @file .ai/tools/task-workspace/src/cleanup/assertWorkspaceCleanupAllowed.service.mjs
 * @version 1.0.2
 * @date 2026-10-16
 * @description Проверяет допустимость удаления артефакта по retention, producer и внешним потребителям.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { requireManaged } from "../dossier/Dossier.repository.mjs";
import { requireQuiescent } from "../dossier/assertDossierLifecycle.validator.mjs";
import { readWorkspaceReferences } from "../consumers/readWorkspaceReferences.adapter.mjs";
import {
  sameProcessAlive,
  readWorkspaceProcesses,
} from "../consumers/readWorkspaceProcesses.adapter.mjs";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { fail } from "../Workspace.error.mjs";
/**
 * Проверяет retention и доступные потребители перед destructive фазой.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types").WorkspaceDossier} dossier
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact} artifact
 */
export function assertWorkspaceCleanupAllowed(storage, dossier, artifact) {
  requireQuiescent(requireManaged(dossier));
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
  const refs = readWorkspaceReferences(storage, relative);
  if (refs.length) fail("source_reference_active");
  const proc = readWorkspaceProcesses(path.join(storage.root, relative));
  if (proc.references.length) fail("process_reference_active");
  return proc;
}
