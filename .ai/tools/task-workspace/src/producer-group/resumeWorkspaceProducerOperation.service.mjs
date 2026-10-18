/**
 * @file .ai/tools/task-workspace/src/producer-group/resumeWorkspaceProducerOperation.service.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Восстанавливает конечные фазы producer-операции из исходного prepared без создания нового handle.
 * @see documentation/specifications/task-management-execution.md
 */
import { assertProducerFinalizationJournal } from "./assertProducerFinalizationJournal.validator.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { assertDossierIdentity } from "../dossier/Dossier.repository.mjs";
import { commitWorkspaceMetadata } from "../recovery/commitWorkspaceMetadata.service.mjs";
import { isWorkspaceRecord } from "../recovery/WorkspaceOperation.repository.mjs";
import { resumeWorkspaceCleanupOperation } from "../cleanup/resumeWorkspaceCleanupOperation.service.mjs";
import { snapshotTree } from "../filesystem/snapshotTree.adapter.mjs";
import { fail } from "../Workspace.error.mjs";
import {
  createProducerDirectories,
  assertEmptyProducerDirectories,
} from "./createProducerDirectories.adapter.mjs";

/**
 * Обработчик принимает только producer kinds; завершающий envelope принадлежит mutation/recover.
 * Восстановленный JSON summary не получает process-local WeakMap binding.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../recovery/WorkspaceOperation.types.ts").WorkspaceMutationContext} ctx
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup | import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupFinalization}
 */
export function resumeWorkspaceProducerOperation(storage, ctx) {
  const journal = ctx.journal;
  if (
    !journal ||
    !["producer-begin", "producer-finalize"].includes(journal.kind)
  )
    fail("producer_operation_required");
  const value = journal.data.producer;
  if (
    !isWorkspaceRecord(value) ||
    value.base !== `.ai-workspace/tasks/${journal.key}` ||
    !isWorkspaceRecord(value.result) ||
    !Array.isArray(value.artifacts) ||
    !value.artifacts.length ||
    !Array.isArray(journal.data.producerMetadataCursorWrites)
  )
    fail("producer_operation_invalid");
  const state =
    /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerOperation} */ (
      value
    );
  const writes =
    /** @type {import("../recovery/WorkspaceOperation.types.ts").WorkspaceFileWrite[]} */ (
      journal.data.producerMetadataCursorWrites
    );
  assertDossierIdentity(storage, journal.key, journal.localDossierId);
  const cleanup = journal.data.cleanup;
  const expectedPaths = [
    `${state.base}/artifact-manifest.json`,
    `${state.base}/TASK.md`,
  ];
  if (cleanup) {
    if (!isWorkspaceRecord(cleanup) || typeof cleanup.planPath !== "string")
      fail("producer_operation_invalid");
    expectedPaths.push(cleanup.planPath);
  }
  if (
    writes.length !== expectedPaths.length ||
    writes.some(
      (write, index) =>
        !isWorkspaceRecord(write) ||
        write.path !== expectedPaths[index] ||
        (write.before !== null && typeof write.before !== "string") ||
        typeof write.after !== "string",
    ) ||
    canonicalHash(state.result) !== canonicalHash(journal.result)
  )
    fail("producer_operation_invalid");
  if (state.kind === "begin" && journal.kind === "producer-begin") {
    if (
      !["directories", "metadata", "completed"].includes(state.phase) ||
      !Array.isArray(state.directories)
    )
      fail("operation_phase_invalid");
    if (
      cleanup ||
      state.result.localKey !== journal.key ||
      state.result.localDossierId !== journal.localDossierId ||
      canonicalHash(state.result.artifactIds) !==
        canonicalHash(state.artifacts.map((artifact) => artifact.id)) ||
      canonicalHash(state.result.paths) !==
        canonicalHash(state.artifacts.map((artifact) => artifact.path))
    )
      fail("producer_operation_invalid");
    const expectedDirectories = new Set();
    for (const artifact of state.artifacts) {
      let directory = state.base;
      for (const part of artifact.path.split("/")) {
        directory += "/" + part;
        expectedDirectories.add(directory);
      }
    }
    if (
      canonicalHash([...expectedDirectories]) !==
      canonicalHash(state.directories.map((directory) => directory.path))
    )
      fail("producer_operation_invalid");
    for (const directory of state.directories) {
      if (
        !isWorkspaceRecord(directory) ||
        typeof directory.path !== "string" ||
        !directory.path.startsWith(state.base + "/") ||
        !["existing", "pending", "created"].includes(directory.state) ||
        (directory.state === "pending"
          ? directory.identity !== null
          : !isWorkspaceRecord(directory.identity) ||
            typeof directory.identity.dev !== "string" ||
            typeof directory.identity.ino !== "string")
      )
        fail("producer_operation_invalid");
    }
    if (state.phase === "directories") {
      createProducerDirectories(storage, state.directories, () => ctx.save());
      assertEmptyProducerDirectories(
        storage,
        state.base,
        state.directories,
        state.artifacts,
      );
      state.phase = "metadata";
      ctx.save();
    }
    assertEmptyProducerDirectories(
      storage,
      state.base,
      state.directories,
      state.artifacts,
    );
    commitWorkspaceMetadata(storage, ctx, writes, "producerMetadataCursor");
    state.phase = "completed";
    ctx.save();
    return state.result;
  }
  if (
    state.kind !== "finalize" ||
    journal.kind !== "producer-finalize" ||
    !["metadata", "cleanup", "completed"].includes(state.phase)
  )
    fail("operation_phase_invalid");
  if (
    !isWorkspaceRecord(journal.input) ||
    !isWorkspaceRecord(journal.input.group)
  )
    fail("producer_operation_invalid");
  assertProducerFinalizationJournal(
    journal,
    /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} */ (
      journal.input.group
    ),
  );
  if (state.phase === "metadata" || !journal.data.cleanup) {
    // Снимки для settle готовятся до prepared; recovery не принимает новые bytes за исходный итог.
    for (const artifact of state.artifacts) {
      const current = snapshotTree(storage, `${state.base}/${artifact.path}`);
      if (
        current.entries[0].kind === "link" ||
        current.hash !== artifact.hash ||
        current.bytes !== artifact.bytes
      )
        fail("artifact_changed");
    }
    commitWorkspaceMetadata(storage, ctx, writes, "producerMetadataCursor");
    state.phase = journal.data.cleanup ? "cleanup" : "completed";
    ctx.save();
  }
  if (journal.data.cleanup) resumeWorkspaceCleanupOperation(storage, ctx);
  state.phase = "completed";
  ctx.save();
  return state.result;
}
