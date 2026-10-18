/**
 * @file .ai/tools/task-workspace/src/dossier/resumeDossierMove.service.mjs
 * @version 1.0.1
 * @date 2026-10-16
 * @description Продолжает закреплённый перенос и запись metadata только из достижимых фаз.
 * @see documentation/specifications/task-management-execution.md
 */
import { readDossier, readArtifacts } from "./Dossier.repository.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { commitWorkspaceMetadata } from "../recovery/commitWorkspaceMetadata.service.mjs";
import { assertDossierMoveAllowed } from "./assertDossierMoveAllowed.service.mjs";
import { fail } from "../Workspace.error.mjs";
/** Фазы различают rename без записи cursor и недопустимую раннюю подмену TASK.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./DossierMove.types").DossierMoveResumeContext} ctx
 * @param {import("./DossierMove.types").DossierMoveOptions} [options]
 * @returns {import("./Dossier.types").WorkspaceTask}
 */
export function resumeDossierMove(storage, ctx, { hook } = {}) {
  if (!ctx.journal) fail("operation_context_required");
  const state =
    /** @type {import("./DossierMove.types").DossierMoveOperation} */ (
      ctx.journal.data.move
    );
  const writes =
    /** @type {import("../recovery/WorkspaceOperation.types").WorkspaceFileWrite[]} */ (
      ctx.journal.data.writes
    );
  if (!["prepared", "moving", "publishing", "completed"].includes(state.phase))
    fail("operation_phase_invalid");
  const reopen = ctx.journal.kind === "reopen";
  const key = ctx.journal.key;
  const tasks = `.ai-workspace/tasks/${key}`,
    history = `.ai-workspace/history/${key}`;
  if (
    state.destination !== (reopen ? tasks : history) ||
    !(reopen ? [tasks, history] : [tasks]).includes(state.source) ||
    state.before.localKey !== key ||
    state.after.localKey !== key ||
    state.before.localDossierId !== state.after.localDossierId ||
    state.after.revision !== state.before.revision + 1 ||
    writes.length !== 1 ||
    writes[0].path !== `${state.destination}/TASK.md`
  )
    fail("move_journal_conflict");
  const check = () => {
    const dossier = readDossier(storage, key);
    if (
      dossier.meta?.localDossierId !== state.before.localDossierId ||
      dossier.bodyHash !== state.bodyHash ||
      canonicalHash(readArtifacts(storage, dossier)) !== state.manifestHash ||
      storage
        .read(`${dossier.base}/artifact-manifest.json`)
        .toString("utf8") !== state.manifestBytes
    )
      fail("move_journal_conflict");
    return dossier;
  };
  if (state.phase === "prepared") {
    if (readDossier(storage, key).base !== state.source)
      fail("move_journal_conflict");
    state.phase = "moving";
    ctx.save();
  }
  if (state.phase === "moving") {
    const dossier = check();
    if (
      storage.read(`${dossier.base}/TASK.md`).toString("utf8") !==
      writes[0].before
    )
      fail("move_journal_conflict");
    if (state.source !== state.destination) {
      if (storage.exists(state.source)) {
        if (storage.exists(state.destination)) fail("dossier_collision");
        assertDossierMoveAllowed(storage, dossier, state.source, reopen);
        hook?.("beforeMove", state);
        // Hook может моделировать изменение файла после проверки.
        const fresh = check();
        if (
          storage.read(`${fresh.base}/TASK.md`).toString("utf8") !==
          writes[0].before
        )
          fail("move_journal_conflict");
        assertDossierMoveAllowed(storage, fresh, state.source, reopen);
        storage.renameNoReplace(state.source, state.destination);
        hook?.("afterMove", state);
      } else if (!storage.exists(state.destination))
        fail("move_outcome_unknown");
    }
    if (check().base !== state.destination) fail("move_outcome_unknown");
    state.phase = "publishing";
    ctx.save();
  }
  const dossier = check();
  if (dossier.base !== state.destination) fail("move_outcome_unknown");
  const raw = storage.read(`${dossier.base}/TASK.md`).toString("utf8");
  if (raw === writes[0].before) {
    assertDossierMoveAllowed(storage, dossier, state.source, reopen);
    hook?.("beforePublish", state);
    assertDossierMoveAllowed(storage, check(), state.source, reopen);
  }
  commitWorkspaceMetadata(storage, ctx, writes);
  hook?.("afterPublish", state);
  state.phase = "completed";
  ctx.save();
  return state.after;
}
