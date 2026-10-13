/**
 * @file .ai/tools/task-workspace/src/applyWorkspaceCleanup.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Восстанавливаемо переносит закреплённые temporary trees в quarantine и очищает их через anchored FD.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { sourceReferences } from "./readWorkspaceReferences.adapter.mjs";
import { processReferences } from "./readWorkspaceProcesses.adapter.mjs";
import {
  withWorkspaceLock,
  runtimeRoot,
} from "./withWorkspaceLock.adapter.mjs";
import {
  readDossier,
  requireManaged,
  readArtifacts,
  writeDossier,
  writeArtifacts,
} from "./Dossier.repository.mjs";
import {
  canonicalHash,
  snapshotTree,
  purgeSnapshot,
} from "./hashWorkspaceTree.adapter.mjs";
import { cleanupGuards } from "./planWorkspaceCleanup.service.mjs";
import { safeTaskKey } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
export function applyWorkspaceCleanup(storage, plan, { hook } = {}) {
  const { hash, ...body } = plan;
  if (
    plan.schemaVersion !== 1 ||
    !hash ||
    canonicalHash(body) !== hash ||
    !Array.isArray(plan.items) ||
    !plan.items.length ||
    !/^[a-f0-9-]{36}$/.test(plan.requestId)
  )
    fail("cleanup_plan_invalid");
  if (
    plan.items.length > 1024 ||
    new Set(plan.items.map((i) => i.artifactId)).size !== plan.items.length ||
    new Set(plan.items.map((i) => i.path)).size !== plan.items.length
  )
    fail("cleanup_plan_invalid");
  const key = safeTaskKey(plan.localKey);
  return withWorkspaceLock(storage, key, () => {
    const file = `${runtimeRoot}/operations/${plan.requestId}.json`;
    let journal;
    if (storage.exists(file)) {
      journal = storage.json(file);
      if (
        journal.kind !== "cleanup" ||
        journal.planHash !== hash ||
        journal.key !== key
      )
        fail("operation_collision");
      if (journal.phase === "completed") return journal.result;
    }
    const dossier = readDossier(storage, key);
    requireManaged(dossier);
    const manifest = readArtifacts(storage, dossier);
    if (!journal) {
      if (
        dossier.meta.localDossierId !== plan.localDossierId ||
        dossier.meta.revision !== plan.taskRevision ||
        manifest.revision !== plan.manifestRevision ||
        dossier.bodyHash !== plan.bodyHash
      )
        fail("cleanup_revision_conflict");
      for (const item of plan.items) {
        const artifact = manifest.artifacts.find(
          (a) =>
            a.id === item.artifactId &&
            a.revision === item.artifactRevision &&
            a.path === item.path,
        );
        if (!artifact || artifact.hash !== item.snapshot.hash)
          fail("cleanup_owner_mismatch");
        cleanupGuards(storage, dossier, artifact);
        const current = snapshotTree(storage, `${dossier.base}/${item.path}`);
        if (canonicalHash(current) !== canonicalHash(item.snapshot))
          fail("artifact_changed");
      }
      journal = {
        schemaVersion: 1,
        kind: "cleanup",
        key,
        planHash: hash,
        phase: "prepared",
        items: plan.items.map((item) => ({
          ...item,
          phase: "prepared",
          quarantine: `${runtimeRoot}/quarantine/${plan.requestId}/${item.artifactId}`,
        })),
        taskBefore: dossier.meta,
        manifestBefore: manifest,
        bodyHash: dossier.bodyHash,
      };
      storage.writeJson(file, journal, true);
    }
    const originalTaskHash = canonicalHash(journal.taskBefore);
    const originalManifestHash = canonicalHash(journal.manifestBefore);
    if (dossier.bodyHash !== journal.bodyHash) fail("document_conflict");
    if (!journal.taskAfter) {
      if (
        canonicalHash(dossier.meta) !== originalTaskHash ||
        canonicalHash(manifest) !== originalManifestHash
      )
        fail("cleanup_revision_conflict");
    } else if (
      ![originalTaskHash, canonicalHash(journal.taskAfter)].includes(
        canonicalHash(dossier.meta),
      ) ||
      ![originalManifestHash, canonicalHash(journal.manifestAfter)].includes(
        canonicalHash(manifest),
      )
    )
      fail("cleanup_revision_conflict");
    for (const item of journal.items) {
      const source = `${dossier.base}/${item.path}`;
      if (item.phase === "completed") continue;
      if (item.phase === "prepared") {
        const artifact = journal.manifestBefore.artifacts.find(
          (a) => a.id === item.artifactId,
        );
        cleanupGuards(storage, dossier, artifact);
        const current = snapshotTree(storage, source);
        if (canonicalHash(current) !== canonicalHash(item.snapshot))
          fail("artifact_changed");
        item.phase = "renaming";
        storage.writeJson(file, journal);
        hook?.("beforeRename", item);
      }
      if (item.phase === "renaming") {
        const src = storage.exists(source),
          dest = storage.exists(item.quarantine);
        if (src && dest) fail("quarantine_collision");
        if (src) {
          const freshDossier = readDossier(storage, key);
          if (
            freshDossier.documentHash !== dossier.documentHash ||
            canonicalHash(readArtifacts(storage, freshDossier)) !==
              originalManifestHash
          )
            fail("cleanup_revision_conflict");
          cleanupGuards(
            storage,
            freshDossier,
            journal.manifestBefore.artifacts.find(
              (a) => a.id === item.artifactId,
            ),
          );
          if (
            canonicalHash(snapshotTree(storage, source)) !==
            canonicalHash(item.snapshot)
          )
            fail("artifact_changed");
          storage.renameNoReplace(source, item.quarantine);
        } else if (!dest) fail("cleanup_outcome_unknown");
        const current = snapshotTree(storage, item.quarantine);
        if (canonicalHash(current) !== canonicalHash(item.snapshot))
          fail("quarantine_changed");
        item.phase = "quarantined";
        storage.writeJson(file, journal);
        hook?.("afterQuarantine", item);
      }
      if (item.phase === "quarantined") {
        item.phase = "purging";
        storage.writeJson(file, journal);
        hook?.("beforePurge", item);
      }
      if (item.phase === "purging") {
        const freshDossier = readDossier(storage, key);
        if (
          freshDossier.documentHash !== dossier.documentHash ||
          canonicalHash(readArtifacts(storage, freshDossier)) !==
            originalManifestHash
        )
          fail("cleanup_revision_conflict");
        cleanupGuards(
          storage,
          freshDossier,
          journal.manifestBefore.artifacts.find(
            (a) => a.id === item.artifactId,
          ),
        );
        if (sourceReferences(storage, item.quarantine).length)
          fail("source_reference_active");
        if (
          processReferences(path.join(storage.root, item.quarantine)).references
            .length
        )
          fail("process_reference_active");
        if (storage.exists(item.quarantine))
          purgeSnapshot(storage, item.quarantine, item.snapshot);
        item.phase = "completed";
        storage.writeJson(file, journal);
        hook?.("afterPurge", item);
      }
    }
    if (!journal.taskAfter) {
      const now = new Date().toISOString();
      journal.manifestAfter = structuredClone(journal.manifestBefore);
      journal.manifestAfter.revision++;
      for (const item of journal.items) {
        journal.manifestAfter.artifacts.find(
          (a) => a.id === item.artifactId,
        ).state = "deleted";
      }
      journal.taskAfter = {
        ...journal.taskBefore,
        revision: journal.taskBefore.revision + 1,
        updatedAt: now,
      };
      journal.result = {
        requestId: plan.requestId,
        status: "completed",
        paths: journal.items.map((i) => i.path),
        estimatedAllocatedBytes: journal.items.reduce(
          (s, i) => s + i.snapshot.allocatedBytes,
          0,
        ),
        completedAt: now,
      };
      journal.phase = "publishing";
      storage.writeJson(file, journal);
    }
    const fresh = readDossier(storage, key);
    if (canonicalHash(readArtifacts(storage, fresh)) === originalManifestHash)
      writeArtifacts(storage, fresh, journal.manifestAfter);
    else if (
      canonicalHash(readArtifacts(storage, fresh)) !==
      canonicalHash(journal.manifestAfter)
    )
      fail("manifest_conflict");
    if (canonicalHash(fresh.meta) === originalTaskHash)
      writeDossier(storage, fresh, journal.taskAfter);
    else if (canonicalHash(fresh.meta) !== canonicalHash(journal.taskAfter))
      fail("revision_conflict");
    storage.writeJson(
      `${fresh.base}/logs/cleanup-results/${plan.requestId}.json`,
      journal.result,
    );
    journal.phase = "completed";
    storage.writeJson(file, journal);
    return journal.result;
  });
}
