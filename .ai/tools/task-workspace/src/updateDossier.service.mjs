/**
 * @file .ai/tools/task-workspace/src/updateDossier.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Применяет CAS переходы локальной задачи с gates результата и сохранением исходных runtime refs.
 * @see documentation/specifications/task-management-execution.md
 */
import { workspaceTransitionSchema } from "@realize/payload-task-manager/workspace-contracts";
import { withWorkspaceLock } from "./withWorkspaceLock.adapter.mjs";
import {
  readDossier,
  requireManaged,
  writeDossier,
  readArtifacts,
} from "./Dossier.repository.mjs";
import {
  assertResult,
  assertClosed,
  requireQuiescent,
  verifyEvidence,
} from "./workspaceLifecycle.validator.mjs";
import { fail } from "./Workspace.error.mjs";
export function updateDossier(storage, key, expectedRevision, input) {
  const transition = workspaceTransitionSchema.parse(input);
  return withWorkspaceLock(storage, key, () => {
    const dossier = readDossier(storage, key);
    const old = requireManaged(dossier, expectedRevision);
    if (old.archivedAt || old.status.category === "closed")
      fail("reopen_required");
    const meta = structuredClone(old);
    const now = new Date().toISOString();
    if (transition.execution) {
      if (
        transition.execution.state === "running" &&
        !transition.execution.runtimeRef
      )
        fail("runtime_ref_required");
      meta.execution = transition.execution;
    }
    if (transition.acceptance) {
      if (transition.acceptance.required !== old.acceptance.required)
        fail("acceptance_policy_immutable");
      meta.acceptance = transition.acceptance;
    }
    if (transition.delivery) {
      if (transition.delivery.required !== old.delivery.required)
        fail("delivery_policy_immutable");
      meta.delivery = transition.delivery;
      for (const ref of meta.delivery.evidence)
        verifyEvidence(
          storage,
          dossier,
          readArtifacts(storage, dossier),
          null,
          ref,
        );
    }
    if (transition.category) {
      meta.status = {
        id: `local:${transition.category}`,
        category: transition.category,
      };
    }
    if (transition.outcome === "cancelled") {
      if (
        transition.category !== "closed" ||
        !transition.cancellationReason?.trim()
      )
        fail("cancellation_reason_required");
      requireQuiescent(meta);
      meta.outcome = "cancelled";
      meta.acceptance = {
        ...meta.acceptance,
        state: meta.acceptance.required ? "pending" : "not_requested",
        resultHash: null,
        criteriaHash: null,
        decidedAt: null,
      };
    }
    const next = { ...dossier, meta };
    const manifest = readArtifacts(storage, dossier);
    if (meta.acceptance.state === "accepted") {
      assertResult(storage, next, manifest);
      if (
        meta.acceptance.resultHash !== meta.result.hash ||
        meta.acceptance.criteriaHash !== dossier.bodyHash ||
        !meta.acceptance.decidedAt
      )
        fail("acceptance_result_mismatch");
    }
    if (meta.status.category === "done") {
      assertResult(storage, next, manifest);
      meta.outcome = null;
    }
    if (meta.status.category === "closed") {
      meta.outcome = meta.outcome === "cancelled" ? "cancelled" : "succeeded";
      assertClosed(storage, next, manifest);
      meta.closedAt = now;
    } else if (transition.outcome) fail("outcome_requires_closed");
    meta.revision++;
    meta.updatedAt = now;
    if (transition.cancellationReason) {
      dossier.body += `\nОтмена: ${transition.cancellationReason.trim()}\n`;
    }
    return writeDossier(storage, dossier, meta).meta;
  });
}
