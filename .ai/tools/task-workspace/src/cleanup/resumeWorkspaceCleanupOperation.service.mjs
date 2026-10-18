/**
 * @file .ai/tools/task-workspace/src/cleanup/resumeWorkspaceCleanupOperation.service.mjs
 * @version 1.0.1
 * @date 2026-10-16
 * @description Продолжает подтверждённые фазы quarantine/purge и metadata исходной операции.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { readDossier, readArtifacts } from "../dossier/Dossier.repository.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { snapshotTree } from "../filesystem/snapshotTree.adapter.mjs";
import { purgeSnapshot } from "../filesystem/purgeSnapshot.adapter.mjs";
import { readWorkspaceReferences } from "../consumers/readWorkspaceReferences.adapter.mjs";
import { readWorkspaceProcesses } from "../consumers/readWorkspaceProcesses.adapter.mjs";
import { assertWorkspaceCleanupAllowed } from "./assertWorkspaceCleanupAllowed.service.mjs";
import { assertWorkspaceOutputAvailable } from "../artifacts/assertWorkspaceOutputAvailable.validator.mjs";
import { commitWorkspaceMetadata } from "../recovery/commitWorkspaceMetadata.service.mjs";
import { validateWorkspaceCleanupPlan } from "./prepareWorkspaceCleanupOperation.service.mjs";
import { fail } from "../Workspace.error.mjs";
import { runtimeRoot } from "../workspacePaths.config.mjs";

/** До каждого destructive effect проверяются исходные metadata и свежие consumers.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceCleanup.types").WorkspaceCleanupResumeContext} ctx
 * @param {import("./WorkspaceCleanup.types").WorkspaceCleanupOperation["items"][number]} item
 */
function guardCleanup(storage, ctx, item) {
  if (!ctx.journal) fail("operation_context_required");
  const state =
    /** @type {import("./WorkspaceCleanup.types").WorkspaceCleanupOperation} */ (
      ctx.journal.data.cleanup
    );
  const dossier = readDossier(storage, ctx.journal.key);
  const manifest = readArtifacts(storage, dossier);
  assertWorkspaceOutputAvailable(
    manifest,
    [`logs/cleanup-results/${state.requestId}.json`],
    "cleanup_evidence_registered",
  );
  if (
    dossier.base !== state.base ||
    dossier.meta?.localDossierId !== state.localDossierId ||
    dossier.bodyHash !== state.bodyHash ||
    canonicalHash(dossier.meta) !== canonicalHash(state.taskBefore) ||
    canonicalHash(manifest) !== canonicalHash(state.manifestBefore) ||
    storage.read(`${dossier.base}/TASK.md`).toString("utf8") !==
      state.writes[1].before ||
    storage.read(`${dossier.base}/artifact-manifest.json`).toString("utf8") !==
      state.writes[0].before
  )
    fail("cleanup_revision_conflict");
  const artifact = manifest.artifacts.find((a) => a.id === item.artifactId);
  if (!artifact) fail("cleanup_owner_mismatch");
  assertWorkspaceCleanupAllowed(storage, dossier, artifact);
}

/** Возвращает исходный результат; завершение общего журнала остаётся у внешнего владельца.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceCleanup.types").WorkspaceCleanupResumeContext} ctx
 * @param {import("./WorkspaceCleanup.types").WorkspaceCleanupOptions} [options]
 * @returns {import("./WorkspaceCleanup.types").WorkspaceCleanupReceipt}
 */
export function resumeWorkspaceCleanupOperation(storage, ctx, { hook } = {}) {
  if (!ctx.journal) fail("operation_context_required");
  const state =
    /** @type {import("./WorkspaceCleanup.types").WorkspaceCleanupOperation} */ (
      ctx.journal.data.cleanup
    );
  const plan =
    /** @type {import("./WorkspaceCleanup.types").WorkspaceCleanupPlan} */ (
      storage.json(state.planPath)
    );
  validateWorkspaceCleanupPlan(plan);
  if (
    plan.hash !== state.planHash ||
    plan.requestId !== state.requestId ||
    plan.localKey !== ctx.journal.key ||
    plan.localDossierId !== state.localDossierId
  )
    fail("cleanup_plan_binding_conflict");
  if (
    ![
      `.ai-workspace/tasks/${plan.localKey}`,
      `.ai-workspace/history/${plan.localKey}`,
    ].includes(state.base) ||
    state.taskBefore.localDossierId !== plan.localDossierId ||
    state.taskBefore.revision !== plan.taskRevision ||
    state.manifestBefore.localDossierId !== plan.localDossierId ||
    state.manifestBefore.revision !== plan.manifestRevision ||
    state.bodyHash !== plan.bodyHash ||
    state.items.length !== plan.items.length
  )
    fail("cleanup_plan_binding_conflict");
  let unfinished = false;
  for (let index = 0; index < state.items.length; index++) {
    const { phase, quarantine, ...original } = state.items[index];
    if (
      canonicalHash(original) !== canonicalHash(plan.items[index]) ||
      quarantine !==
        `${runtimeRoot}/quarantine/${plan.requestId}/${original.artifactId}` ||
      !["prepared", "renaming", "quarantined", "purging", "completed"].includes(
        phase,
      ) ||
      (unfinished && phase !== "prepared")
    )
      fail("operation_phase_invalid");
    if (phase !== "completed") unfinished = true;
  }
  const expectedPaths = [
    `${state.base}/artifact-manifest.json`,
    `${state.base}/TASK.md`,
    `${state.base}/logs/cleanup-results/${plan.requestId}.json`,
  ];
  if (
    state.writes.length !== 3 ||
    state.writes.some((write, index) => write.path !== expectedPaths[index])
  )
    fail("operation_plan_conflict");
  if (!["prepared", "publishing", "completed"].includes(state.phase))
    fail("operation_phase_invalid");
  for (const item of state.items) {
    const source = `${state.base}/${item.path}`;
    if (item.phase === "completed") {
      if (storage.exists(source) || storage.exists(item.quarantine))
        fail("cleanup_outcome_unknown");
      continue;
    }
    if (state.phase !== "prepared") fail("operation_phase_invalid");
    if (item.phase === "prepared") {
      guardCleanup(storage, ctx, item);
      if (
        canonicalHash(snapshotTree(storage, source)) !==
        canonicalHash(item.snapshot)
      )
        fail("artifact_changed");
      item.phase = "renaming";
      ctx.save();
      hook?.("beforeRename", item);
    }
    if (item.phase === "renaming") {
      guardCleanup(storage, ctx, item);
      const src = storage.exists(source),
        dest = storage.exists(item.quarantine);
      if (src && dest) fail("quarantine_collision");
      if (src) {
        if (
          canonicalHash(snapshotTree(storage, source)) !==
          canonicalHash(item.snapshot)
        )
          fail("artifact_changed");
        storage.renameNoReplace(source, item.quarantine);
        hook?.("afterRename", item);
      } else if (!dest) fail("cleanup_outcome_unknown");
      if (
        canonicalHash(snapshotTree(storage, item.quarantine)) !==
        canonicalHash(item.snapshot)
      )
        fail("quarantine_changed");
      item.phase = "quarantined";
      ctx.save();
      hook?.("afterQuarantine", item);
    }
    if (item.phase === "quarantined") {
      guardCleanup(storage, ctx, item);
      if (
        canonicalHash(snapshotTree(storage, item.quarantine)) !==
        canonicalHash(item.snapshot)
      )
        fail("quarantine_changed");
      item.phase = "purging";
      ctx.save();
      hook?.("beforePurge", item);
    }
    if (item.phase === "purging") {
      guardCleanup(storage, ctx, item);
      if (storage.exists(source)) fail("cleanup_outcome_unknown");
      if (readWorkspaceReferences(storage, item.quarantine).length)
        fail("source_reference_active");
      if (
        readWorkspaceProcesses(path.join(storage.root, item.quarantine))
          .references.length
      )
        fail("process_reference_active");
      // Только durable purging допускает проверенное подмножество исходного снимка.
      if (storage.exists(item.quarantine))
        purgeSnapshot(storage, item.quarantine, item.snapshot);
      hook?.("afterPurgeEffect", item);
      item.phase = "completed";
      ctx.save();
      hook?.("afterPurge", item);
    }
    if (item.phase !== "completed") fail("operation_phase_invalid");
  }
  if (state.phase === "prepared") {
    state.phase = "publishing";
    ctx.save();
  }
  hook?.("beforePublish", state);
  const dossier = readDossier(storage, ctx.journal.key);
  if (
    dossier.base !== state.base ||
    dossier.bodyHash !== state.bodyHash ||
    dossier.meta?.localDossierId !== state.localDossierId
  )
    fail("document_conflict");
  assertWorkspaceOutputAvailable(
    readArtifacts(storage, dossier),
    [`logs/cleanup-results/${state.requestId}.json`],
    "cleanup_evidence_registered",
  );
  commitWorkspaceMetadata(storage, ctx, state.writes, "cleanupMetadataCursor");
  hook?.("afterPublish", state);
  state.phase = "completed";
  ctx.save();
  return state.result;
}
