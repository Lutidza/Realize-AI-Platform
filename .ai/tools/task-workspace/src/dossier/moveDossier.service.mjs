/**
 * @file .ai/tools/task-workspace/src/dossier/moveDossier.service.mjs
 * @version 1.0.4
 * @date 2026-10-16
 * @description Подготавливает архивирование и переоткрытие под общим журналом мутации.
 * @see documentation/specifications/task-management-execution.md
 */
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import {
  readDossier,
  requireManaged,
  serializeDossier,
  assertDossierIdentity,
} from "./Dossier.repository.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { safeTaskKey } from "../filesystem/safeTaskKey.validator.mjs";
import { assertDossierMoveAllowed } from "./assertDossierMoveAllowed.service.mjs";
import { resumeDossierMove } from "./resumeDossierMove.service.mjs";
import { recoverLegacyDossierMove } from "./recoverLegacyDossierMove.service.mjs";
import { fail } from "../Workspace.error.mjs";
/** Готовит конечные metadata до rename и связывает повтор с исходной revision.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {number} expectedRevision
 * @param {boolean} [reopen]
 * @param {import("./DossierMove.types").DossierMoveOptions} [options]
 * @returns {import("./Dossier.types").WorkspaceTask}
 */
export function moveDossier(
  storage,
  key,
  expectedRevision,
  reopen = false,
  { hook } = {},
) {
  safeTaskKey(key);
  const kind = reopen ? "reopen" : "archive";
  return withWorkspaceMutation(
    storage,
    key,
    {
      kind,
      operationId: `${key}-${kind}-${expectedRevision}`,
      checkCompletedIdentity: (id) => assertDossierIdentity(storage, key, id),
      input: { expectedRevision },
    },
    (ctx) => {
      if (ctx.legacy) return recoverLegacyDossierMove(storage, ctx, { hook });
      if (!ctx.journal) {
        const dossier = readDossier(storage, key);
        const before = requireManaged(dossier, expectedRevision);
        if (!reopen && before.archivedAt) fail("closed_task_required");
        const manifest = assertDossierMoveAllowed(
          storage,
          dossier,
          dossier.base,
          reopen,
        );
        const destination = `.ai-workspace/${reopen ? "tasks" : "history"}/${key}`;
        if (destination !== dossier.base && storage.exists(destination))
          fail("dossier_collision");
        const now = new Date().toISOString();
        const after = {
          ...before,
          revision: before.revision + 1,
          updatedAt: now,
          archivedAt: reopen ? null : now,
        };
        if (reopen) {
          after.status = { id: "local:active", category: "active" };
          after.outcome = null;
          after.closedAt = null;
          after.acceptance = {
            ...after.acceptance,
            state: after.acceptance.required ? "pending" : "not_requested",
            resultHash: null,
            criteriaHash: null,
            decidedAt: null,
          };
          after.delivery = {
            ...after.delivery,
            state: after.delivery.required ? "pending" : "not_requested",
            evidence: [],
          };
        }
        const writes = [
          {
            path: `${destination}/TASK.md`,
            before: storage.read(`${dossier.base}/TASK.md`).toString("utf8"),
            after: serializeDossier(after, dossier.body),
          },
        ];
        ctx.prepare({
          localDossierId: before.localDossierId,
          data: {
            move: {
              phase: "prepared",
              source: dossier.base,
              destination,
              before,
              after,
              bodyHash: dossier.bodyHash,
              manifestHash: canonicalHash(manifest),
              manifestBytes: storage
                .read(`${dossier.base}/artifact-manifest.json`)
                .toString("utf8"),
            },
            writes,
          },
        });
      }
      return ctx.complete(resumeDossierMove(storage, ctx, { hook }));
    },
  );
}
