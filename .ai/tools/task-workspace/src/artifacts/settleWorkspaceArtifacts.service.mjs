/**
 * @file .ai/tools/task-workspace/src/artifacts/settleWorkspaceArtifacts.service.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Завершает зарегистрированный producer после его остановки и закрепляет окончательный snapshot.
 * @see documentation/specifications/task-management-execution.md
 */
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import { resumeWorkspaceMetadataOperation } from "../recovery/commitWorkspaceMetadata.service.mjs";
import {
  readDossier,
  assertDossierIdentity,
  dossierAbsenceGuards,
  requireManaged,
  readArtifacts,
  planDossierMetadata,
} from "../dossier/Dossier.repository.mjs";
import { prepareWorkspaceSettlement } from "./prepareWorkspaceSettlement.service.mjs";

/**
 * Закрепляет settlement в общем журнале до записи манифеста и TASK.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {number} expectedRevision
 * @param {import("./WorkspaceArtifacts.types").WorkspaceArtifactSettlementInput} input
 * @param {Pick<import("../recovery/WorkspaceOperation.types.ts").WorkspaceMutationOptions, "operationId">} [options]
 * @returns {import("../dossier/Dossier.types").WorkspaceTask}
 */
export function settleWorkspaceArtifacts(
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
      kind: "settle",
      operationId: options.operationId,
      checkCompletedIdentity: (localDossierId) =>
        assertDossierIdentity(storage, key, localDossierId),
      input: { expectedRevision, input },
    },
    (ctx) => {
      if (ctx.journal) return resumeWorkspaceMetadataOperation(storage, ctx);
      const dossier = readDossier(storage, key);
      requireManaged(dossier, expectedRevision);
      const { meta, manifest } = prepareWorkspaceSettlement(
        storage,
        dossier,
        readArtifacts(storage, dossier),
        input,
        { now: new Date().toISOString() },
      );
      const writes = planDossierMetadata(storage, dossier, meta, manifest);
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
