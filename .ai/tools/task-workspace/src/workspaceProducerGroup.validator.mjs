/**
 * @file .ai/tools/task-workspace/src/workspaceProducerGroup.validator.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет managed-владельца и неизменную привязку process-local producer group к зарегистрированным артефактам.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  readDossier,
  requireManaged,
  readArtifacts,
} from "./Dossier.repository.mjs";
import { canonicalHash } from "./hashWorkspaceTree.adapter.mjs";
import { fail } from "./Workspace.error.mjs";

const groups = new WeakMap();

export function requireProducerDossier(storage, key, expectedRevision) {
  const dossier = readDossier(storage, key);
  if (expectedRevision === undefined) requireManaged(dossier);
  else requireManaged(dossier, expectedRevision);
  if (
    dossier.meta.archivedAt ||
    dossier.base !== `.ai-workspace/tasks/${key}` ||
    !["open", "active", "done"].includes(dossier.meta.status.category)
  )
    fail("reopen_required");
  return dossier;
}

export function bindProducerGroup(dossier, input, artifacts) {
  const group = Object.freeze({
    localKey: dossier.meta.localKey,
    localDossierId: dossier.meta.localDossierId,
    stageId: input.stageId ?? null,
    attemptId: input.attemptId ?? null,
    artifactIds: Object.freeze(artifacts.map((artifact) => artifact.id)),
    paths: Object.freeze(artifacts.map((artifact) => artifact.path)),
  });
  groups.set(group, {
    artifacts: artifacts.map((artifact) => structuredClone(artifact)),
  });
  return group;
}

export function requireProducerGroup(storage, group, expectedRevision) {
  const binding = groups.get(group);
  if (!binding) fail("producer_group_unbound");
  const dossier = requireProducerDossier(
    storage,
    group.localKey,
    expectedRevision,
  );
  if (dossier.meta.localDossierId !== group.localDossierId)
    fail("producer_group_owner_mismatch");
  const manifest = readArtifacts(storage, dossier);
  const artifacts = binding.artifacts.map((bound) => {
    const current = manifest.artifacts.find(
      (artifact) => artifact.id === bound.id,
    );
    // Retention может получить новых consumers: его проверяет штатный cleanup guard.
    const metadata = (artifact) => {
      const { retention: _retention, ...identity } = artifact;
      return identity;
    };
    if (
      !current ||
      canonicalHash(metadata(current)) !== canonicalHash(metadata(bound))
    )
      fail("producer_group_metadata_changed");
    return current;
  });
  return { dossier, manifest, artifacts, binding };
}

export function recordSettledProducerGroup(binding) {
  for (const artifact of binding.artifacts) {
    artifact.revision++;
    artifact.producer.settled = true;
  }
}

export function refreshSettledProducerGroup(storage, group, expectedRevision) {
  const binding = groups.get(group);
  const dossier = requireProducerDossier(
    storage,
    group.localKey,
    expectedRevision,
  );
  if (dossier.meta.localDossierId !== group.localDossierId)
    fail("producer_group_owner_mismatch");
  const manifest = readArtifacts(storage, dossier);
  for (const bound of binding.artifacts) {
    const artifact = manifest.artifacts.find((item) => item.id === bound.id);
    if (!artifact) fail("producer_group_metadata_changed");
    const {
      hash: _hash,
      bytes: _bytes,
      retention: _retention,
      ...actual
    } = artifact;
    const {
      hash: _boundHash,
      bytes: _boundBytes,
      retention: _boundRetention,
      ...expected
    } = bound;
    if (canonicalHash(actual) !== canonicalHash(expected))
      fail("producer_group_metadata_changed");
    bound.hash = artifact.hash;
    bound.bytes = artifact.bytes;
  }
  return { dossier, manifest };
}

/** Cleanup evidence хранится вне любого ready tree, иначе запись изменит уже settled snapshot. */
export function requireUnregisteredCleanupEvidence(manifest) {
  const outputs = ["logs/cleanup-plans", "logs/cleanup-results"];
  if (
    manifest.artifacts.some(
      (artifact) =>
        artifact.state === "ready" &&
        outputs.some(
          (output) =>
            output === artifact.path || output.startsWith(artifact.path + "/"),
        ),
    )
  )
    fail("cleanup_evidence_registered");
}
