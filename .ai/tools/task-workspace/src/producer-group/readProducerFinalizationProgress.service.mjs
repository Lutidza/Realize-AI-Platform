/**
 * @file .ai/tools/task-workspace/src/producer-group/readProducerFinalizationProgress.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Определяет подтверждённую фазу producer-finalize по durable journal и фактическим metadata.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  readDossier,
  readArtifacts,
  requireManaged,
} from "../dossier/Dossier.repository.mjs";
import {
  readPendingWorkspaceOperation,
  readCompletedWorkspaceOperation,
  workspaceOperationReference,
  WORKSPACE_OPERATION_MAX_BYTES,
} from "../recovery/WorkspaceOperation.repository.mjs";
import { assertProducerFinalizationJournal } from "./assertProducerFinalizationJournal.validator.mjs";
import {
  assertWorkspaceProducerGroup,
  assertProducerArtifactSet,
} from "./assertWorkspaceProducerGroup.validator.mjs";
import { fail } from "../Workspace.error.mjs";

/**
 * In-memory cursor после неудачного save не является доказательством. Completed допускает
 * новые чужие записи; pending требует точного достижимого prefix всей исходной операции.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 * @param {string} operationId
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerFinalizationProgress}
 */
export function readProducerFinalizationProgress(storage, group, operationId) {
  /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerFinalizationProgress} */
  const unknown = {
    settlement: "unknown",
    phase: "unknown",
    operation: null,
    planPath: null,
    artifacts: null,
  };
  try {
    const pending = readPendingWorkspaceOperation(storage, group.localKey);
    const journal =
      pending?.operationId === operationId
        ? pending
        : readCompletedWorkspaceOperation(storage, group.localKey, operationId);
    if (!journal) return unknown;
    unknown.operation = workspaceOperationReference(journal);
    const { state, writes, cleanup } = assertProducerFinalizationJournal(
      journal,
      group,
    );
    const dossier = readDossier(storage, group.localKey);
    if (
      requireManaged(dossier).localDossierId !== group.localDossierId ||
      dossier.base !== state.base
    )
      fail("producer_group_owner_mismatch");
    const manifest = readArtifacts(storage, dossier);
    unknown.planPath = cleanup?.planPath ?? null;
    if (journal.phase === "completed") {
      const expected = cleanup
        ? cleanup.manifestAfter.artifacts.filter((artifact) =>
            group.artifactIds.includes(artifact.id),
          )
        : state.artifacts;
      assertProducerArtifactSet(group, expected);
      const artifacts = assertWorkspaceProducerGroup(
        { artifacts: expected },
        manifest,
      );
      return {
        ...unknown,
        settlement: "settled",
        phase: "completed",
        artifacts,
      };
    }
    if (state.phase === "metadata") {
      const actual = readPrefix(
        storage,
        writes,
        journal.data.producerMetadataCursor,
      );
      if (actual[0] === writes[0].after && actual[1] === writes[1].after) {
        const artifacts = assertWorkspaceProducerGroup(
          { artifacts: state.artifacts },
          manifest,
        );
        return {
          ...unknown,
          settlement: "settled",
          phase: "settlement",
          artifacts,
        };
      }
      if (actual[0] === writes[0].after && actual[1] === writes[1].before)
        return { ...unknown, settlement: "partial", phase: "settlement" };
      if (actual[0] === writes[0].before && actual[1] === writes[1].before) {
        const artifacts = manifest.artifacts.filter((artifact) =>
          group.artifactIds.includes(artifact.id),
        );
        if (artifacts.length !== group.artifactIds.length)
          fail("producer_operation_invalid");
        return {
          ...unknown,
          settlement: artifacts.every((artifact) => artifact.producer.settled)
            ? "settled"
            : "unsettled",
          phase: "settlement",
        };
      }
      return unknown;
    }
    if (!cleanup) {
      readPrefix(storage, writes, journal.data.producerMetadataCursor);
      const artifacts = assertWorkspaceProducerGroup(
        { artifacts: state.artifacts },
        manifest,
      );
      return {
        ...unknown,
        settlement: "settled",
        phase: state.phase === "completed" ? "completed" : "unknown",
        artifacts,
      };
    }
    if (
      !["cleanup", "completed"].includes(state.phase) ||
      readText(storage, cleanup.planPath) !== writes[2]?.after
    )
      fail("producer_operation_invalid");
    const actual = readPrefix(
      storage,
      cleanup.writes,
      journal.data.cleanupMetadataCursor,
    );
    const expectedManifest =
      actual[0] === cleanup.writes[0].after
        ? cleanup.manifestAfter
        : cleanup.manifestBefore;
    const expected = expectedManifest.artifacts.filter((artifact) =>
      group.artifactIds.includes(artifact.id),
    );
    assertProducerArtifactSet(group, expected);
    const artifacts = assertWorkspaceProducerGroup(
      { artifacts: expected },
      manifest,
    );
    return {
      ...unknown,
      settlement: "settled",
      phase: state.phase === "completed" ? "completed" : "cleanup",
      artifacts,
    };
  } catch {
    return unknown;
  }
}

/** @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage @param {string} file */
function readText(storage, file) {
  if (!storage.exists(file)) return null;
  const bytes = storage.read(file, WORKSPACE_OPERATION_MAX_BYTES);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) fail("metadata_state_conflict");
  return text;
}

/**
 * Разрешён сохранённый prefix и максимум одна совершённая запись перед save cursor.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../recovery/WorkspaceOperation.types.ts").WorkspaceFileWrite[]} writes
 * @param {unknown} savedCursor
 */
function readPrefix(storage, writes, savedCursor) {
  const cursor = savedCursor ?? 0;
  if (
    !Number.isInteger(cursor) ||
    typeof cursor !== "number" ||
    cursor < 0 ||
    cursor > writes.length
  )
    fail("metadata_cursor_invalid");
  const actual = writes.map((write) => readText(storage, write.path));
  for (const [index, write] of writes.entries()) {
    if (
      index < cursor
        ? actual[index] !== write.after
        : index === cursor
          ? actual[index] !== write.before && actual[index] !== write.after
          : actual[index] !== write.before
    )
      fail("metadata_state_conflict");
  }
  return actual;
}
