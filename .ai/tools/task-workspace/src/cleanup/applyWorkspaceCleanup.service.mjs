/**
 * @file .ai/tools/task-workspace/src/cleanup/applyWorkspaceCleanup.service.mjs
 * @version 1.0.3
 * @date 2026-10-15
 * @description Связывает очистку с исходным планом и общим контекстом восстанавливаемой мутации.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  dossierBase,
  assertDossierIdentity,
} from "../dossier/Dossier.repository.mjs";
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import {
  prepareWorkspaceCleanupOperation,
  validateWorkspaceCleanupPlan,
} from "./prepareWorkspaceCleanupOperation.service.mjs";
import { resumeWorkspaceCleanupOperation } from "./resumeWorkspaceCleanupOperation.service.mjs";
import { recoverLegacyWorkspaceCleanup } from "./recoverLegacyWorkspaceCleanup.service.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { fail } from "../Workspace.error.mjs";

/** План передаётся с фактическим путём; default сохраняет совместимость штатного planner.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceCleanup.types").WorkspaceCleanupPlan} plan
 * @param {import("./WorkspaceCleanup.types").WorkspaceCleanupOptions} [options]
 * @returns {import("./WorkspaceCleanup.types").WorkspaceCleanupReceipt}
 */
export function applyWorkspaceCleanup(storage, plan, { hook, planPath } = {}) {
  validateWorkspaceCleanupPlan(plan);
  const key = plan.localKey;
  planPath ??= `${dossierBase(storage, key)}/logs/cleanup-plans/${plan.requestId}.json`;
  return withWorkspaceMutation(
    storage,
    key,
    {
      kind: "cleanup",
      operationId: plan.requestId,
      checkCompletedIdentity: (id) => assertDossierIdentity(storage, key, id),
      input: { planPath, planHash: plan.hash },
      legacy: {
        operationId: plan.requestId,
        planPath,
        planHash: plan.hash,
        localDossierId: plan.localDossierId,
      },
    },
    (ctx) => {
      if (ctx.legacy)
        return recoverLegacyWorkspaceCleanup(storage, ctx, { hook });
      if (!ctx.journal) {
        if (
          !storage.exists(planPath) ||
          canonicalHash(storage.json(planPath)) !== canonicalHash(plan)
        )
          fail("cleanup_plan_binding_conflict");
        const cleanup = prepareWorkspaceCleanupOperation(
          storage,
          plan,
          planPath,
        );
        ctx.prepare({
          localDossierId: plan.localDossierId,
          data: {
            cleanup,
            cleanupMetadataCursorWrites: cleanup.writes,
          },
        });
      }
      return ctx.complete(
        resumeWorkspaceCleanupOperation(storage, ctx, { hook }),
      );
    },
  );
}
