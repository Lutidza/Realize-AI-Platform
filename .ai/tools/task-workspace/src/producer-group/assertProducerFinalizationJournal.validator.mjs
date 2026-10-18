/**
 * @file .ai/tools/task-workspace/src/producer-group/assertProducerFinalizationJournal.validator.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Проверяет полный собственный переход и фиксированные пути сохранённой producer-finalize операции.
 * @see documentation/specifications/task-management-execution.md
 */
import { workspaceArtifactManifestSchema } from "@realize/payload-task-manager/workspace-contracts";
import { parseDossierText } from "../dossier/parseDossierText.validator.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { isWorkspaceRecord } from "../recovery/WorkspaceOperation.repository.mjs";
import {
  assertProducerArtifactSet,
  assertWorkspaceProducerGroup,
} from "./assertWorkspaceProducerGroup.validator.mjs";
import { fail } from "../Workspace.error.mjs";

/**
 * Проверяется сохранённый план, а не только подпись envelope; пустой subset и чужой output не подтверждают binding.
 * @param {import("../recovery/WorkspaceOperation.types.ts").WorkspaceOperationJournal} journal
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 */
export function assertProducerFinalizationJournal(journal, group) {
  if (
    journal.kind !== "producer-finalize" ||
    journal.key !== group.localKey ||
    journal.localDossierId !== group.localDossierId ||
    !isWorkspaceRecord(journal.input) ||
    canonicalHash(journal.input.group) !== canonicalHash(group)
  )
    fail("producer_operation_invalid");
  const state =
    /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerFinalizeOperation} */ (
      journal.data.producer
    );
  const writes =
    /** @type {import("../recovery/WorkspaceOperation.types.ts").WorkspaceFileWrite[]} */ (
      journal.data.producerMetadataCursorWrites
    );
  const cleanup =
    /** @type {import("../cleanup/WorkspaceCleanup.types.ts").WorkspaceCleanupOperation | undefined} */ (
      journal.data.cleanup
    );
  if (
    !isWorkspaceRecord(state) ||
    state.kind !== "finalize" ||
    state.base !== `.ai-workspace/tasks/${group.localKey}` ||
    !["metadata", "cleanup", "completed"].includes(state.phase) ||
    (!cleanup && state.phase === "cleanup") ||
    (journal.phase === "completed" && state.phase !== "completed") ||
    canonicalHash(state.artifactIds) !== canonicalHash(group.artifactIds)
  )
    fail("producer_operation_invalid");
  assertProducerArtifactSet(group, state.artifacts);
  if (state.artifacts.some((artifact) => artifact.producer?.settled !== true))
    fail("producer_operation_invalid");
  const result = state.result;
  if (
    !isWorkspaceRecord(result) ||
    result.status !== "completed" ||
    result.settlement !== "settled" ||
    result.phase !== "completed" ||
    result.operation !== null ||
    canonicalHash(result.artifactIds) !== canonicalHash(group.artifactIds) ||
    canonicalHash(result) !== canonicalHash(journal.result) ||
    !isWorkspaceRecord(result.cleanup)
  )
    fail("producer_operation_invalid");
  const expectedPaths = [
    `${state.base}/artifact-manifest.json`,
    `${state.base}/TASK.md`,
  ];
  if (cleanup) {
    if (
      !isWorkspaceRecord(cleanup) ||
      !["prepared", "publishing", "completed"].includes(cleanup.phase) ||
      (journal.phase === "completed" && cleanup.phase !== "completed") ||
      typeof cleanup.planPath !== "string" ||
      !cleanup.planPath.startsWith(`${state.base}/logs/`) ||
      !cleanup.planPath.endsWith(".json")
    )
      fail("producer_operation_invalid");
    safeRelative(cleanup.planPath);
    expectedPaths.push(cleanup.planPath);
    if (
      result.cleanup.status !== "completed" ||
      result.cleanup.planPath !== cleanup.planPath ||
      canonicalHash(result.cleanup.receipt) !== canonicalHash(cleanup.result)
    )
      fail("producer_operation_invalid");
    assertWrites(cleanup.writes, [
      expectedPaths[0],
      expectedPaths[1],
      `${state.base}/logs/cleanup-results/${cleanup.requestId}.json`,
    ]);
    for (const manifest of [cleanup.manifestBefore, cleanup.manifestAfter]) {
      if (
        !isWorkspaceRecord(manifest) ||
        manifest.localDossierId !== group.localDossierId ||
        !Array.isArray(manifest.artifacts)
      )
        fail("producer_operation_invalid");
      const artifacts = manifest.artifacts.filter((artifact) =>
        group.artifactIds.includes(artifact.id),
      );
      assertProducerArtifactSet(group, artifacts);
      if (artifacts.some((artifact) => artifact.producer?.settled !== true))
        fail("producer_operation_invalid");
    }
    assertWorkspaceProducerGroup(
      { artifacts: state.artifacts },
      cleanup.manifestBefore,
    );
  } else if (
    !["not_requested", "not_needed"].includes(result.cleanup.status) ||
    result.cleanup.planPath !== null
  )
    fail("producer_operation_invalid");
  assertWrites(writes, expectedPaths);
  assertMetadataTransition(writes, group, state.artifacts, cleanup);
  return { state, writes, cleanup };
}

/** @param {import("../recovery/WorkspaceOperation.types.ts").WorkspaceFileWrite[]} writes @param {string[]} paths */
function assertWrites(writes, paths) {
  if (
    !Array.isArray(writes) ||
    writes.length !== paths.length ||
    writes.some(
      (write, index) =>
        !isWorkspaceRecord(write) ||
        write.path !== paths[index] ||
        typeof write.after !== "string" ||
        (index < 2 ? typeof write.before !== "string" : write.before !== null),
    )
  )
    fail("producer_operation_invalid");
}

/**
 * Producer может только завершить собственные records; чужие записи, body и остальные поля TASK сохраняются.
 * @param {import("../recovery/WorkspaceOperation.types.ts").WorkspaceFileWrite[]} writes
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact[]} artifacts
 * @param {import("../cleanup/WorkspaceCleanup.types.ts").WorkspaceCleanupOperation | undefined} cleanup
 */
function assertMetadataTransition(writes, group, artifacts, cleanup) {
  const before = workspaceArtifactManifestSchema.parse(
    JSON.parse(/** @type {string} */ (writes[0].before)),
  );
  const after = workspaceArtifactManifestSchema.parse(
    JSON.parse(writes[0].after),
  );
  if (
    before.localDossierId !== group.localDossierId ||
    after.localDossierId !== group.localDossierId
  )
    fail("producer_operation_invalid");
  const ownBefore = before.artifacts.filter((artifact) =>
    group.artifactIds.includes(artifact.id),
  );
  assertProducerArtifactSet(group, ownBefore);
  const changed = ownBefore.some((artifact) => !artifact.producer.settled)
    ? 1
    : 0;
  const expected = structuredClone(before);
  expected.revision += changed;
  for (const artifact of expected.artifacts) {
    if (!group.artifactIds.includes(artifact.id)) continue;
    const target = artifacts.find((candidate) => candidate.id === artifact.id);
    if (!target) fail("producer_operation_invalid");
    if (!artifact.producer.settled) {
      artifact.producer.settled = true;
      artifact.revision++;
      artifact.hash = target.hash;
      artifact.bytes = target.bytes;
    }
    if (canonicalHash(artifact) !== canonicalHash(target))
      fail("producer_operation_invalid");
  }
  if (canonicalHash(expected) !== canonicalHash(after))
    fail("producer_operation_invalid");
  assertTaskTransition(writes[1], group, changed);
  if (!cleanup) return;
  if (
    cleanup.writes[0].before !== writes[0].after ||
    cleanup.writes[1].before !== writes[1].after ||
    canonicalHash(cleanup.manifestBefore) !== canonicalHash(after)
  )
    fail("producer_operation_invalid");
  const ids = artifacts
    .filter((artifact) => artifact.category === "temporary")
    .map((artifact) => artifact.id);
  if (
    !Array.isArray(cleanup.items) ||
    cleanup.items.length !== ids.length ||
    new Set(cleanup.items.map((item) => item.artifactId)).size !== ids.length ||
    cleanup.items.some(
      (item) =>
        !ids.includes(item.artifactId) ||
        item.path !==
          artifacts.find((artifact) => artifact.id === item.artifactId)?.path,
    )
  )
    fail("producer_operation_invalid");
  const deleted = structuredClone(after);
  deleted.revision++;
  for (const artifact of deleted.artifacts)
    if (ids.includes(artifact.id)) artifact.state = "deleted";
  const actualDeleted = workspaceArtifactManifestSchema.parse(
    JSON.parse(cleanup.writes[0].after),
  );
  if (
    canonicalHash(deleted) !== canonicalHash(actualDeleted) ||
    canonicalHash(deleted) !== canonicalHash(cleanup.manifestAfter)
  )
    fail("producer_operation_invalid");
  assertTaskTransition(cleanup.writes[1], group, 1);
}

/** @param {import("../recovery/WorkspaceOperation.types.ts").WorkspaceFileWrite} write @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group @param {number} revisionDelta */
function assertTaskTransition(write, group, revisionDelta) {
  const before = parseDossierText(
    /** @type {string} */ (write.before),
    group.localKey,
  );
  const after = parseDossierText(write.after, group.localKey);
  if (
    !before.meta ||
    !after.meta ||
    before.meta.localDossierId !== group.localDossierId ||
    after.meta.localDossierId !== group.localDossierId ||
    before.body !== after.body
  )
    fail("producer_operation_invalid");
  const expected = {
    ...before.meta,
    revision: before.meta.revision + revisionDelta,
    updatedAt: revisionDelta ? after.meta.updatedAt : before.meta.updatedAt,
  };
  if (canonicalHash(expected) !== canonicalHash(after.meta))
    fail("producer_operation_invalid");
}
