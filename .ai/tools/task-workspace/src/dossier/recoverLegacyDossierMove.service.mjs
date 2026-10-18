/**
 * @file .ai/tools/task-workspace/src/dossier/recoverLegacyDossierMove.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Продолжает прежний archive/reopen journal, сохраняя путь и прежние фазы.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  readDossier,
  readArtifacts,
  serializeDossier,
  assertDossierIdentity,
} from "./Dossier.repository.mjs";
import { workspaceTaskSchema } from "@realize/payload-task-manager/workspace-contracts";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { resumeDossierMove } from "./resumeDossierMove.service.mjs";
import { fail } from "../Workspace.error.mjs";

/** Прежняя publishing допускает before/after одного TASK, но moving допускает только before.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../recovery/WorkspaceOperation.types").WorkspaceMutationContext} ctx
 * @param {import("./DossierMove.types").DossierMoveOptions} [options]
 * @returns {import("./Dossier.types").WorkspaceTask}
 */
export function recoverLegacyDossierMove(storage, ctx, options = {}) {
  if (!ctx.legacy) fail("operation_context_required");
  const { reference } = ctx.legacy;
  const journal =
    /** @type {import("./DossierMove.types").LegacyDossierMoveJournal} */ (
      ctx.legacy.journal
    );
  if (journal.phase === "completed") {
    const after = workspaceTaskSchema.parse(journal.after);
    if (
      after.localKey !== reference.key ||
      after.localDossierId !== reference.localDossierId ||
      after.revision !== journal.before.revision + 1
    )
      fail("legacy_operation_invalid");
    assertDossierIdentity(storage, reference.key, reference.localDossierId);
    return after;
  }
  const dossier = readDossier(storage, reference.key);
  if (
    dossier.meta?.localDossierId !== journal.before.localDossierId ||
    dossier.bodyHash !== journal.bodyHash ||
    canonicalHash(readArtifacts(storage, dossier)) !== journal.manifestHash
  )
    fail("move_journal_conflict");
  const before = canonicalHash(dossier.meta) === canonicalHash(journal.before);
  const after = canonicalHash(dossier.meta) === canonicalHash(journal.after);
  if ((!before && !after) || (journal.phase !== "publishing" && !before))
    fail("move_journal_conflict");
  const writes = journal.metadataWrites ?? [
    {
      path: `${journal.destination}/TASK.md`,
      before: before
        ? storage.read(`${dossier.base}/TASK.md`).toString("utf8")
        : serializeDossier(journal.before, dossier.body),
      after: serializeDossier(journal.after, dossier.body),
    },
  ];
  const move = {
    ...journal,
    manifestBytes:
      journal.manifestBytes ??
      storage.read(`${dossier.base}/artifact-manifest.json`).toString("utf8"),
  };
  const data = {
    move,
    writes,
    metadataCursor: journal.metadataCursor ?? (after ? 1 : 0),
  };
  /** @type {import("./DossierMove.types").DossierMoveResumeContext} */
  const facade = {
    ...ctx,
    journal: {
      phase: "prepared",
      key: reference.key,
      kind: reference.kind,
      data,
    },
    save() {
      Object.assign(journal, {
        phase: move.phase,
        metadataWrites: writes,
        metadataCursor: data.metadataCursor,
        manifestBytes: move.manifestBytes,
      });
      storage.writeJson(reference.path, journal);
    },
  };
  facade.save();
  return resumeDossierMove(storage, facade, options);
}
