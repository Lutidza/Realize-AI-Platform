/**
 * @file .ai/tools/task-workspace/src/artifacts/registerWorkspaceArtifacts.service.mjs
 * @version 1.1.2
 * @date 2026-10-15
 * @description Регистрирует явно выбранные артефакты и retention по фактическому ограниченному снимку файлового дерева.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  readDossier,
  assertDossierIdentity,
  dossierAbsenceGuards,
  requireManaged,
  planDossierMetadata,
  readArtifacts,
} from "../dossier/Dossier.repository.mjs";
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import { resumeWorkspaceMetadataOperation } from "../recovery/commitWorkspaceMetadata.service.mjs";

import { prepareWorkspaceRegistration } from "./prepareWorkspaceRegistration.service.mjs";

/**
 * Сохраняет регистрацию через один prepared журнал с replay результата до подготовки UUID.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {number} expectedRevision
 * @param {import("./WorkspaceArtifacts.types").WorkspaceArtifactRegistrationInput} input
 * @param {Pick<import("../recovery/WorkspaceOperation.types.ts").WorkspaceMutationOptions, "operationId">} [options]
 * @returns {import("../dossier/Dossier.types").WorkspaceTask}
 */
export function registerWorkspaceArtifacts(
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
      kind: "register",
      operationId: options.operationId,
      checkCompletedIdentity: (localDossierId) =>
        assertDossierIdentity(storage, key, localDossierId),
      input: { expectedRevision, input },
    },
    (ctx) => {
      if (ctx.journal) return resumeWorkspaceMetadataOperation(storage, ctx);
      const dossier = readDossier(storage, key);
      requireManaged(dossier, expectedRevision);
      const { meta, manifest } = prepareWorkspaceRegistration(
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
