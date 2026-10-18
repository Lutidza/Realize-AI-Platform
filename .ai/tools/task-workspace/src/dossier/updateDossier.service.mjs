/**
 * @file .ai/tools/task-workspace/src/dossier/updateDossier.service.mjs
 * @version 1.0.4
 * @date 2026-10-15
 * @description Применяет CAS переходы локальной задачи с gates результата и сохранением исходных runtime refs.
 * @see documentation/specifications/task-management-execution.md
 */
import { workspaceTransitionSchema } from "@realize/payload-task-manager/workspace-contracts";
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import { resumeWorkspaceMetadataOperation } from "../recovery/commitWorkspaceMetadata.service.mjs";
import {
  readDossier,
  assertDossierIdentity,
  dossierAbsenceGuards,
  requireManaged,
  planDossierMetadata,
  readArtifacts,
} from "./Dossier.repository.mjs";
import { requireQuiescent } from "./assertDossierLifecycle.validator.mjs";
import {
  verifyEvidence,
  verifyWorkspaceResult,
  verifyWorkspaceClosure,
} from "../artifacts/verifyWorkspaceEvidence.service.mjs";
import { withWorkspaceEvidencePhase } from "../artifacts/withWorkspaceEvidencePhase.service.mjs";
import { fail } from "../Workspace.error.mjs";
import { hashBytes } from "../filesystem/canonicalHash.util.mjs";
/**
 * Применяет один переход после проверки входа и ожидаемой ревизии.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {number} expectedRevision
 * @param {unknown} input
 * @param {Pick<import("../recovery/WorkspaceOperation.types.ts").WorkspaceMutationOptions, "operationId">} [options]
 * @returns {import("../dossier/Dossier.types").WorkspaceTask}
 */
export function updateDossier(
  storage,
  key,
  expectedRevision,
  input,
  options = {},
) {
  return withWorkspaceMutation(
    storage,
    key,
    {
      kind: "status",
      operationId: options.operationId,
      checkCompletedIdentity: (localDossierId) =>
        assertDossierIdentity(storage, key, localDossierId),
      input: { expectedRevision, input },
    },
    (ctx) => {
      if (ctx.journal) return resumeWorkspaceMetadataOperation(storage, ctx);
      const transition = workspaceTransitionSchema.parse(input);
      if (
        transition.cancellationReason !== undefined &&
        transition.outcome !== "cancelled"
      )
        fail("cancellation_reason_requires_cancelled");
      const cancellationReason = transition.cancellationReason?.trim();
      if (
        transition.outcome === "cancelled" &&
        (transition.category !== "closed" || !cancellationReason)
      )
        fail("cancellation_reason_required");

      const dossier = readDossier(storage, key);
      const old = requireManaged(dossier, expectedRevision);
      if (old.archivedAt || old.status.category === "closed")
        fail("reopen_required");
      const meta = structuredClone(old);
      const body =
        transition.outcome === "cancelled"
          ? `${dossier.body}\nОтмена: ${cancellationReason}\n`
          : dossier.body;
      const bodyBytes = Buffer.from(body);
      if (bodyBytes.length > 512 * 1024) fail("body_limit");
      // documentHash остаётся исходным условием CAS; gates видят окончательное тело.
      const next = {
        ...dossier,
        meta,
        body,
        bodyHash: hashBytes(bodyBytes),
      };
      const manifest = readArtifacts(storage, dossier);
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
      }
      if (transition.category) {
        meta.status = {
          id: `local:${transition.category}`,
          category: transition.category,
        };
      }
      if (transition.outcome === "cancelled") {
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
      if (meta.status.category === "done") meta.outcome = null;
      if (meta.status.category === "closed")
        meta.outcome = meta.outcome === "cancelled" ? "cancelled" : "succeeded";
      else if (transition.outcome) fail("outcome_requires_closed");
      // Все gates видят одно окончательное состояние; до выхода фазы metadata не изменяются.
      withWorkspaceEvidencePhase(storage, next, (phase) => {
        if (transition.delivery)
          for (const ref of meta.delivery.evidence)
            verifyEvidence(storage, next, manifest, null, ref, phase);
        if (meta.acceptance.state === "accepted") {
          verifyWorkspaceResult(storage, next, manifest, phase);
          if (
            !meta.result ||
            meta.acceptance.resultHash !== meta.result.hash ||
            meta.acceptance.criteriaHash !== next.bodyHash ||
            !meta.acceptance.decidedAt
          )
            fail("acceptance_result_mismatch");
        }
        if (meta.status.category === "done")
          verifyWorkspaceResult(storage, next, manifest, phase);
        if (meta.status.category === "closed")
          verifyWorkspaceClosure(storage, next, manifest, phase);
      });
      if (meta.status.category === "closed") meta.closedAt = now;
      meta.revision++;
      meta.updatedAt = now;
      const writes = planDossierMetadata(storage, next, meta);
      ctx.prepare({
        localDossierId: meta.localDossierId,
        data: {
          writes,
          absentPaths: dossierAbsenceGuards(dossier),
          result: meta,
        },
        result: meta,
      });
      return resumeWorkspaceMetadataOperation(storage, ctx);
    },
  );
}
