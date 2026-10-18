/**
 * @file .ai/tools/task-workspace/src/cleanup/planWorkspaceCleanup.service.mjs
 * @version 1.0.3
 * @date 2026-10-15
 * @description Готовит exact cleanup plan для disposable артефактов с hashes, revision guards и consumer checks.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import {
  planWorkspaceFile,
  resumeWorkspaceMetadataOperation,
} from "../recovery/commitWorkspaceMetadata.service.mjs";
import {
  readDossier,
  assertDossierIdentity,
  dossierAbsenceGuards,
  requireManaged,
  readArtifacts,
  planDossierReadGuards,
} from "../dossier/Dossier.repository.mjs";
import { prepareWorkspaceCleanupPlan } from "./prepareWorkspaceCleanupPlan.service.mjs";
import { fail } from "../Workspace.error.mjs";
/**
 * Сохраняет immutable cleanup plan через prepared журнал, удерживающий TASK и manifest.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {number} expectedRevision
 * @param {string[]} [selection]
 * @param {string} [output]
 * @param {Pick<import("../recovery/WorkspaceOperation.types.ts").WorkspaceMutationOptions, "operationId">} [options]
 * @returns {import("./WorkspaceCleanup.types").WorkspaceCleanupPlanResult}
 */
export function planWorkspaceCleanup(
  storage,
  key,
  expectedRevision,
  selection,
  output,
  options = {},
) {
  const requestId =
    options.operationId === undefined ? randomUUID() : undefined;
  const operationId = options.operationId ?? `plan-cleanup-${requestId}`;
  return withWorkspaceMutation(
    storage,
    key,
    {
      kind: "plan-cleanup",
      operationId,
      checkCompletedIdentity: (localDossierId) =>
        assertDossierIdentity(storage, key, localDossierId),
      input: {
        expectedRevision,
        ...(selection === undefined ? {} : { selection }),
        ...(output === undefined ? {} : { output }),
      },
    },
    (ctx) => {
      if (ctx.journal) return resumeWorkspaceMetadataOperation(storage, ctx);
      const dossier = readDossier(storage, key);
      const meta = requireManaged(dossier, expectedRevision);
      const result = prepareWorkspaceCleanupPlan(
        storage,
        dossier,
        readArtifacts(storage, dossier),
        selection,
        output,
        { requestId: requestId ?? randomUUID(), now: new Date().toISOString() },
      );
      if (storage.exists(result.file)) fail("cleanup_plan_exists");
      const writes = [
        ...planDossierReadGuards(storage, dossier),
        planWorkspaceFile(
          storage,
          result.file,
          JSON.stringify(result.plan, null, 2) + "\n",
        ),
      ];
      ctx.prepare({
        localDossierId: meta.localDossierId,
        data: { writes, absentPaths: dossierAbsenceGuards(dossier), result },
        result,
      });
      return resumeWorkspaceMetadataOperation(storage, ctx);
    },
  );
}
