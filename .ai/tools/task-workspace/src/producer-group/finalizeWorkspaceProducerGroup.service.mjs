/**
 * @file .ai/tools/task-workspace/src/producer-group/finalizeWorkspaceProducerGroup.service.mjs
 * @version 1.0.4
 * @date 2026-10-15
 * @description Завершает собственную группу с подтверждённым settlement и продолжением исходного journal.
 * @see documentation/specifications/task-management-execution.md
 */
import { assertDossierIdentity } from "../dossier/Dossier.repository.mjs";
import { randomUUID } from "node:crypto";
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import { workspaceOperationReference } from "../recovery/WorkspaceOperation.repository.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { WorkspaceError, fail } from "../Workspace.error.mjs";
import {
  readProducerGroupBinding,
  requireConfirmedProducerGroup,
  refreshProducerGroupFromOperation,
  rememberProducerOperation,
} from "./WorkspaceProducerGroup.repository.mjs";
import { prepareWorkspaceProducerFinalization } from "./prepareWorkspaceProducerFinalization.service.mjs";
import { resumeWorkspaceProducerOperation } from "./resumeWorkspaceProducerOperation.service.mjs";

/**
 * Caller подтверждает child exit и flush. Один запрос повторяет исходный ID; смена
 * cleanup policy начинает новую операцию только после подтверждённого собственного перехода.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
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
  /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerFinalizationProgress} */
  let progress = {
    settlement: "unknown",
    phase: "preflight",
    operation: null,
    planPath: null,
    artifacts: null,
  };
  /** @type {readonly string[]} */
  let paths = [];
  const requestHash = canonicalHash({
    quiescent: input.quiescent,
    cleanupTemporary: input.cleanupTemporary,
  });
  try {
    const binding = readProducerGroupBinding(group);
    paths = binding.artifacts
      .filter((artifact) => artifact.category === "temporary")
      .map((artifact) => artifact.path);
    return withWorkspaceMutation(
      storage,
      group.localKey,
      {
        kind: "producer-finalize",
        operationId:
          binding.requests.get(requestHash)?.operationId ?? randomUUID(),
        input: {
          group,
          quiescent: input.quiescent,
          cleanupTemporary: input.cleanupTemporary,
        },
        checkCompletedIdentity(id) {
          assertDossierIdentity(storage, group.localKey, id);
          requireConfirmedProducerGroup(storage, group);
        },
      },
      (ctx) => {
        let preparationStarted = false;
        try {
          if (!ctx.journal) {
            const initial = requireConfirmedProducerGroup(storage, group);
            progress.settlement = initial.artifacts.every(
              (artifact) => artifact.producer.settled,
            )
              ? "settled"
              : "unsettled";
            const prepared = prepareWorkspaceProducerFinalization(
              storage,
              initial,
              group,
              input,
              ctx.operationId,
            );
            preparationStarted = true;
            ctx.prepare({ localDossierId: group.localDossierId, ...prepared });
          }
          if (!ctx.journal) fail("producer_operation_required");
          // Binding проверяется после исходного pending, чтобы partial settle не выглядел чужой правкой.
          rememberProducerOperation(
            binding,
            requestHash,
            workspaceOperationReference(ctx.journal),
          );
          const result =
            /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerFinalizationCompleted} */ (
              resumeWorkspaceProducerOperation(storage, ctx)
            );
          progress = refreshProducerGroupFromOperation(
            storage,
            group,
            ctx.operationId,
          );
          if (progress.settlement !== "settled" || !progress.artifacts)
            fail("producer_group_metadata_changed");
          const completed = ctx.complete(result);
          if (ctx.journal)
            rememberProducerOperation(
              binding,
              requestHash,
              workspaceOperationReference(ctx.journal),
            );
          return completed;
        } catch (error) {
          // Только durable readback под тем же lock может подтвердить достигнутую фазу после ошибки save.
          const saved = refreshProducerGroupFromOperation(
            storage,
            group,
            ctx.operationId,
          );
          if (saved.operation) {
            progress = saved;
            rememberProducerOperation(binding, requestHash, saved.operation);
          } else if (ctx.journal || preparationStarted) progress = saved;
          throw error;
        }
      },
    );
  } catch (caught) {
    const error =
      /** @type {NodeJS.ErrnoException & {operation?: import("../recovery/WorkspaceOperation.types.ts").WorkspaceOperationReference}} */ (
        caught
      );
    if (!(caught instanceof WorkspaceError) && !error.operation) throw caught;
    const reason = error.code ?? "producer_operation_interrupted";
    return {
      status: "blocked",
      artifactIds: group?.artifactIds ?? [],
      reason,
      settlement: progress.settlement,
      phase: progress.phase,
      operation: progress.operation ?? error.operation ?? null,
      cleanup: {
        status: "blocked",
        paths,
        reason,
        planPath: progress.planPath,
      },
    };
  }
}
