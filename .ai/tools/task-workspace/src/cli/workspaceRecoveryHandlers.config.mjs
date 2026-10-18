/**
 * @file .ai/tools/task-workspace/src/cli/workspaceRecoveryHandlers.config.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Собирает конечные обработчики восстановления без обратной зависимости recovery от сервисов.
 * @see documentation/specifications/task-management-execution.md
 */
import { assertDossierIdentity } from "../dossier/Dossier.repository.mjs";
import { recoverWorkspaceOperation } from "../recovery/recoverWorkspaceOperation.service.mjs";
import { resumeWorkspaceMetadataOperation } from "../recovery/commitWorkspaceMetadata.service.mjs";
import { resumeWorkspaceCleanupOperation } from "../cleanup/resumeWorkspaceCleanupOperation.service.mjs";
import { recoverLegacyWorkspaceCleanup } from "../cleanup/recoverLegacyWorkspaceCleanup.service.mjs";
import { resumeDossierMove } from "../dossier/resumeDossierMove.service.mjs";
import { recoverLegacyDossierMove } from "../dossier/recoverLegacyDossierMove.service.mjs";
import { resumeWorkspaceProducerOperation } from "../producer-group/resumeWorkspaceProducerOperation.service.mjs";

/** Передаёт только известные владельцу операции; пользователь не выбирает код обработчика.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {string} operationId
 */
export function recoverWorkspaceTaskOperation(storage, key, operationId) {
  return recoverWorkspaceOperation(
    storage,
    key,
    operationId,
    {
      create: resumeWorkspaceMetadataOperation,
      adopt: resumeWorkspaceMetadataOperation,
      status: resumeWorkspaceMetadataOperation,
      register: resumeWorkspaceMetadataOperation,
      settle: resumeWorkspaceMetadataOperation,
      result: resumeWorkspaceMetadataOperation,
      "plan-cleanup": resumeWorkspaceMetadataOperation,
      cleanup: (fs, ctx) =>
        ctx.legacy
          ? recoverLegacyWorkspaceCleanup(fs, ctx)
          : resumeWorkspaceCleanupOperation(fs, ctx),
      archive: (fs, ctx) =>
        ctx.legacy
          ? recoverLegacyDossierMove(fs, ctx)
          : resumeDossierMove(fs, ctx),
      reopen: (fs, ctx) =>
        ctx.legacy
          ? recoverLegacyDossierMove(fs, ctx)
          : resumeDossierMove(fs, ctx),
      "producer-begin": resumeWorkspaceProducerOperation,
      "producer-finalize": resumeWorkspaceProducerOperation,
    },
    (id) => assertDossierIdentity(storage, key, id),
  );
}
