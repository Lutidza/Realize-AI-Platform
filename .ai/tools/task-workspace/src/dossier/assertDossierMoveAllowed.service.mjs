/**
 * @file .ai/tools/task-workspace/src/dossier/assertDossierMoveAllowed.service.mjs
 * @version 1.0.1
 * @date 2026-10-16
 * @description Проверяет lifecycle, producers и consumers перед переносом досье.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { requireManaged, readArtifacts } from "./Dossier.repository.mjs";
import { requireQuiescent } from "./assertDossierLifecycle.validator.mjs";
import { verifyWorkspaceClosure } from "../artifacts/verifyWorkspaceEvidence.service.mjs";
import { readWorkspaceReferences } from "../consumers/readWorkspaceReferences.adapter.mjs";
import { matchWorkspaceReferences } from "../consumers/matchWorkspaceReferences.util.mjs";
import {
  readWorkspaceProcesses,
  sameProcessAlive,
} from "../consumers/readWorkspaceProcesses.adapter.mjs";
import { fail } from "../Workspace.error.mjs";
/** Повтор проверяет текущие consumers и producers перед каждым новым move или metadata write.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./Dossier.types").WorkspaceDossier} dossier
 * @param {string} source
 * @param {boolean} reopen
 */
export function assertDossierMoveAllowed(storage, dossier, source, reopen) {
  const meta = requireManaged(dossier);
  requireQuiescent(meta);
  if (meta.status.category !== "closed") fail("closed_task_required");
  const manifest = readArtifacts(storage, dossier);
  for (const artifact of manifest.artifacts) {
    if (
      artifact.state === "ready" &&
      (!artifact.producer.settled ||
        sameProcessAlive(artifact.producer.pid, artifact.producer.identity))
    )
      fail("artifact_producer_active");
  }
  if (!reopen) verifyWorkspaceClosure(storage, { ...dossier, meta }, manifest);
  // Собственные относительные ссылки разрешаются из назначения: переносимые ссылки остаются рабочими.
  const destination = `.ai-workspace/${reopen ? "tasks" : "history"}/${meta.localKey}`;
  if (
    source !== destination &&
    matchWorkspaceReferences(
      storage.root,
      `${destination}/TASK.md`,
      dossier.body,
      source,
      true,
    )
  )
    fail("dossier_consumer_active");
  for (const base of new Set([source, dossier.base])) {
    if (
      readWorkspaceReferences(storage, base).length ||
      readWorkspaceProcesses(path.join(storage.root, base)).references.length
    )
      fail("dossier_consumer_active");
  }
  return manifest;
}
