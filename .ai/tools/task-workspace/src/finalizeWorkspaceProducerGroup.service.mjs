/**
 * @file .ai/tools/task-workspace/src/finalizeWorkspaceProducerGroup.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Завершает caller-controlled группу после quiescence и очищает только её exact temporary trees штатными guards.
 * @see documentation/specifications/task-management-execution.md
 */
import { settleWorkspaceArtifacts } from "./settleWorkspaceArtifact.service.mjs";
import { planWorkspaceCleanup } from "./planWorkspaceCleanup.service.mjs";
import { applyWorkspaceCleanup } from "./applyWorkspaceCleanup.service.mjs";
import { withWorkspaceLock } from "./withWorkspaceLock.adapter.mjs";
import { WorkspaceError, fail } from "./Workspace.error.mjs";
import {
  requireProducerGroup,
  recordSettledProducerGroup,
  refreshSettledProducerGroup,
  requireUnregisteredCleanupEvidence,
} from "./workspaceProducerGroup.validator.mjs";

/**
 * Caller сначала останавливает children и flush streams. quiescent:false сохраняет unsettled producers и все outputs.
 * @param {import("./WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupFinalizationInput} input
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupFinalization}
 */
export function finalizeWorkspaceProducerGroup(storage, group, input) {
  if (
    !input ||
    Object.keys(input).some(
      (name) => !["quiescent", "cleanupTemporary"].includes(name),
    ) ||
    typeof input.quiescent !== "boolean" ||
    typeof input.cleanupTemporary !== "boolean"
  )
    fail("invalid_producer_finalization");
  /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupFinalization} */
  const result = {
    status: "blocked",
    artifactIds: group?.artifactIds ?? [],
    cleanup: { status: "blocked", paths: [] },
  };
  try {
    const initial = withWorkspaceLock(storage, group?.localKey, () =>
      requireProducerGroup(storage, group),
    );
    result.cleanup.paths = initial.artifacts
      .filter((artifact) => artifact.category === "temporary")
      .map((artifact) => artifact.path);
    if (!input.quiescent) fail("producer_group_not_quiescent");
    let revision = initial.dossier.meta.revision;
    if (initial.artifacts.some((artifact) => !artifact.producer.settled)) {
      const settled = settleWorkspaceArtifacts(
        storage,
        group.localKey,
        revision,
        { artifactIds: group.artifactIds },
      );
      revision = settled.revision;
      recordSettledProducerGroup(initial.binding);
      withWorkspaceLock(storage, group.localKey, () =>
        refreshSettledProducerGroup(storage, group, revision),
      );
    }
    if (!input.cleanupTemporary || !result.cleanup.paths.length) {
      result.status = "completed";
      result.cleanup.status = input.cleanupTemporary
        ? "not_needed"
        : "not_requested";
      return result;
    }
    withWorkspaceLock(storage, group.localKey, () => {
      const current = requireProducerGroup(storage, group, revision);
      requireUnregisteredCleanupEvidence(current.manifest);
    });
    const { plan } = planWorkspaceCleanup(
      storage,
      group.localKey,
      revision,
      result.cleanup.paths,
    );
    const receipt = applyWorkspaceCleanup(storage, plan, {
      // Hook исполняется под штатным cleanup lock непосредственно перед destructive phases.
      hook(phase) {
        if (phase === "beforeRename" || phase === "beforePurge") {
          const current = requireProducerGroup(storage, group);
          requireUnregisteredCleanupEvidence(current.manifest);
        }
      },
    });
    result.status = "completed";
    result.cleanup = {
      status: "completed",
      paths: result.cleanup.paths,
      receipt,
    };
    return result;
  } catch (error) {
    if (!(error instanceof WorkspaceError)) throw error;
    result.reason = error.code;
    result.cleanup.reason = error.code;
    return result;
  }
}
