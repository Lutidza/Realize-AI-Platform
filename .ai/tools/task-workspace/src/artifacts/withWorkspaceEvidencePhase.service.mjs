/**
 * @file .ai/tools/task-workspace/src/artifacts/withWorkspaceEvidencePhase.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Ограничивает повторное использование снимков одной синхронной фазой проверки evidence без записей.
 * @see documentation/specifications/task-management-execution.md
 */
import { snapshotTree } from "../filesystem/snapshotTree.adapter.mjs";
import { sameProcessAlive } from "../consumers/readWorkspaceProcesses.adapter.mjs";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { fail } from "../Workspace.error.mjs";

/**
 * Callback выполняет только чтения. Выход, исключение и Promise закрывают capability;
 * следующая фаза, запись и destructive action не получают прежний снимок доверия.
 * @template TResult
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types.ts").WorkspaceDossier} dossier
 * @param {(phase: import("./WorkspaceEvidence.types.ts").WorkspaceEvidencePhase) => TResult} callback
 * @returns {TResult}
 */
export function withWorkspaceEvidencePhase(storage, dossier, callback) {
  /** @type {Map<string, Pick<import("../filesystem/WorkspaceTree.types.ts").WorkspaceTreeSnapshot, "hash" | "bytes">>} */
  const snapshots = new Map();
  let active = true;
  /** @type {import("./WorkspaceEvidence.types.ts").WorkspaceEvidencePhase} */
  const phase = Object.freeze({
    assertContext(actualStorage, actualDossier) {
      if (!active) fail("evidence_phase_closed");
      if (actualStorage !== storage || actualDossier !== dossier)
        fail("evidence_phase_context_mismatch");
    },
    verifyArtifact(artifact) {
      phase.assertContext(storage, dossier);
      if (
        artifact.state !== "ready" ||
        artifact.retention.mode !== "retain" ||
        !artifact.producer.settled ||
        sameProcessAlive(artifact.producer.pid, artifact.producer.identity)
      )
        fail("result_artifact_not_durable");
      const path = `${dossier.base}/${artifact.path}`;
      let actual = snapshots.get(path);
      if (!actual) {
        const { hash, bytes } = snapshotTree(storage, path);
        actual = Object.freeze({ hash, bytes });
        snapshots.set(path, actual);
      }
      // Reuse физического снимка не пропускает сравнение текущей версии metadata.
      if (actual.hash !== artifact.hash || actual.bytes !== artifact.bytes)
        fail("result_artifact_changed");
    },
    verifyEvidence(manifest, refs, evidence) {
      phase.assertContext(storage, dossier);
      safeRelative(evidence);
      if (!evidence.startsWith("logs/")) fail("check_evidence_required");
      const artifact = manifest.artifacts.find(
        (candidate) =>
          candidate.path === evidence ||
          evidence.startsWith(candidate.path + "/"),
      );
      if (
        !artifact ||
        (refs &&
          !refs.some(
            (ref) =>
              ref.id === artifact.id &&
              ref.revision === artifact.revision &&
              ref.hash === artifact.hash,
          ))
      )
        fail("evidence_not_registered");
      phase.verifyArtifact(artifact);
      if (!storage.stat(`${dossier.base}/${evidence}`).isFile())
        fail("evidence_file_required");
    },
  });
  try {
    const result = callback(phase);
    if (
      result &&
      (typeof result === "object" || typeof result === "function") &&
      "then" in result
    )
      fail("evidence_phase_async");
    return result;
  } finally {
    active = false;
    snapshots.clear();
  }
}
