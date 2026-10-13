/**
 * @file .ai/tools/task-workspace/src/moveDossier.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Архивирует и переоткрывает досье без overwrite, с проверкой consumers и восстанавливаемым move journal.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import {
  withWorkspaceLock,
  runtimeRoot,
} from "./withWorkspaceLock.adapter.mjs";
import {
  readDossier,
  requireManaged,
  readArtifacts,
  writeDossier,
} from "./Dossier.repository.mjs";
import { canonicalHash } from "./hashWorkspaceTree.adapter.mjs";
import {
  assertClosed,
  requireQuiescent,
} from "./workspaceLifecycle.validator.mjs";
import { sourceReferences } from "./readWorkspaceReferences.adapter.mjs";
import {
  processReferences,
  sameProcessAlive,
} from "./readWorkspaceProcesses.adapter.mjs";
import { safeTaskKey } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";

/** Повтор проверяет текущие consumers и producers перед каждым новым move или metadata write. */
function moveGuards(storage, dossier, source, reopen) {
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
  if (!reopen) assertClosed(storage, dossier, manifest);
  // Relative logs/... сохраняются; full old paths в собственном TASK после move сломаются.
  if (
    dossier.body.includes(source) ||
    dossier.body.includes(path.join(storage.root, source))
  )
    fail("dossier_consumer_active");
  for (const base of new Set([source, dossier.base])) {
    if (
      sourceReferences(storage, base).length ||
      processReferences(path.join(storage.root, base)).references.length
    )
      fail("dossier_consumer_active");
  }
  return manifest;
}

/** hook нужен только synthetic interruption fixtures; CLI его не принимает. */
export function moveDossier(
  storage,
  key,
  expectedRevision,
  reopen = false,
  { hook } = {},
) {
  safeTaskKey(key);
  return withWorkspaceLock(storage, key, () => {
    const kind = reopen ? "reopen" : "archive";
    const file = `${runtimeRoot}/operations/${key}-${kind}-${expectedRevision}.json`;
    let journal = storage.exists(file) ? storage.json(file) : null;
    const taskBase = `.ai-workspace/tasks/${key}`;
    const historyBase = `.ai-workspace/history/${key}`;
    if (
      journal &&
      (journal.kind !== kind ||
        journal.key !== key ||
        !["prepared", "moving", "publishing", "completed"].includes(
          journal.phase,
        ) ||
        journal.destination !== (reopen ? taskBase : historyBase) ||
        !(reopen ? [taskBase, historyBase] : [taskBase]).includes(
          journal.source,
        ))
    )
      fail("move_journal_conflict");
    if (journal && journal.phase === "completed") {
      const actual = readDossier(storage, key);
      if (canonicalHash(actual.meta) !== canonicalHash(journal.after))
        fail("revision_conflict");
      return actual.meta;
    }
    let dossier = readDossier(storage, key);
    if (!journal) {
      const old = requireManaged(dossier, expectedRevision);
      if (!reopen && old.archivedAt) fail("closed_task_required");
      const manifest = moveGuards(storage, dossier, dossier.base, reopen);
      const destination = reopen ? taskBase : historyBase;
      if (destination !== dossier.base && storage.exists(destination))
        fail("dossier_collision");
      const now = new Date().toISOString();
      const after = {
        ...old,
        revision: old.revision + 1,
        updatedAt: now,
        archivedAt: reopen ? null : now,
      };
      if (reopen) {
        after.status = { id: "local:active", category: "active" };
        after.outcome = null;
        after.closedAt = null;
        after.acceptance = {
          ...after.acceptance,
          state: after.acceptance.required ? "pending" : "not_requested",
          resultHash: null,
          criteriaHash: null,
          decidedAt: null,
        };
        after.delivery = {
          ...after.delivery,
          state: after.delivery.required ? "pending" : "not_requested",
          evidence: [],
        };
      }
      journal = {
        kind,
        key,
        phase: "prepared",
        source: dossier.base,
        destination,
        before: old,
        after,
        bodyHash: dossier.bodyHash,
        manifestHash: canonicalHash(manifest),
      };
      storage.writeJson(file, journal, true);
    }
    if (
      journal.kind !== kind ||
      journal.key !== key ||
      journal.before.revision !== expectedRevision ||
      journal.after.revision !== expectedRevision + 1 ||
      dossier.bodyHash !== journal.bodyHash ||
      canonicalHash(readArtifacts(storage, dossier)) !== journal.manifestHash ||
      ![canonicalHash(journal.before), canonicalHash(journal.after)].includes(
        canonicalHash(dossier.meta),
      )
    )
      fail("move_journal_conflict");
    if (journal.phase === "prepared") {
      journal.phase = "moving";
      storage.writeJson(file, journal);
    }
    if (journal.phase === "moving") {
      if (journal.source !== journal.destination) {
        if (storage.exists(journal.source)) {
          if (storage.exists(journal.destination)) fail("dossier_collision");
          dossier = readDossier(storage, key);
          moveGuards(storage, dossier, journal.source, reopen);
          hook?.("beforeMove", journal);
          storage.renameNoReplace(journal.source, journal.destination);
          hook?.("afterMove", journal);
        } else if (!storage.exists(journal.destination))
          fail("move_outcome_unknown");
      }
      dossier = readDossier(storage, key);
      if (dossier.meta.localDossierId !== journal.before.localDossierId)
        fail("dossier_identity_mismatch");
      journal.phase = "publishing";
      storage.writeJson(file, journal);
    }
    dossier = readDossier(storage, key);
    if (canonicalHash(dossier.meta) === canonicalHash(journal.before)) {
      if (
        dossier.bodyHash !== journal.bodyHash ||
        canonicalHash(readArtifacts(storage, dossier)) !== journal.manifestHash
      )
        fail("move_journal_conflict");
      moveGuards(storage, dossier, journal.source, reopen);
      hook?.("beforePublish", journal);
      dossier = writeDossier(storage, dossier, journal.after);
      hook?.("afterPublish", journal);
    } else if (canonicalHash(dossier.meta) !== canonicalHash(journal.after))
      fail("revision_conflict");
    journal.phase = "completed";
    storage.writeJson(file, journal);
    return dossier.meta;
  });
}
