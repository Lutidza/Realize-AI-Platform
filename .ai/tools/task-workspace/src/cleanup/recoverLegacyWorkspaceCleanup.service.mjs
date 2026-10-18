/**
 * @file .ai/tools/task-workspace/src/cleanup/recoverLegacyWorkspaceCleanup.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Продолжает прежний cleanup journal на исходном месте после явной привязки оригинального плана.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  readDossier,
  readArtifacts,
  serializeDossier,
  assertDossierIdentity,
} from "../dossier/Dossier.repository.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import {
  cleanupJson,
  validateWorkspaceCleanupPlan,
} from "./prepareWorkspaceCleanupOperation.service.mjs";
import { resumeWorkspaceCleanupOperation } from "./resumeWorkspaceCleanupOperation.service.mjs";
import { fail } from "../Workspace.error.mjs";

/** Старые metadata не содержат cursor: допускается только существовавший порядок manifest → TASK → receipt.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../recovery/WorkspaceOperation.types").WorkspaceMutationContext} ctx
 * @param {import("./WorkspaceCleanup.types").WorkspaceCleanupOptions} [options]
 * @returns {import("./WorkspaceCleanup.types").WorkspaceCleanupReceipt}
 */
export function recoverLegacyWorkspaceCleanup(storage, ctx, options = {}) {
  if (!ctx.legacy) fail("operation_context_required");
  const { reference } = ctx.legacy;
  const journal =
    /** @type {import("./WorkspaceCleanup.types").LegacyWorkspaceCleanupJournal} */ (
      ctx.legacy.journal
    );
  if (!reference.planPath)
    fail(
      "original_plan_required",
      "Укажите исходный проверенный cleanup --plan <original> --apply.",
    );
  const plan =
    /** @type {import("./WorkspaceCleanup.types").WorkspaceCleanupPlan} */ (
      storage.json(reference.planPath)
    );
  validateWorkspaceCleanupPlan(plan);
  if (
    plan.requestId !== reference.operationId ||
    plan.hash !== journal.planHash ||
    plan.localKey !== journal.key ||
    plan.localDossierId !== journal.taskBefore.localDossierId
  )
    fail("cleanup_plan_binding_conflict");
  if (journal.phase === "completed") {
    assertDossierIdentity(storage, plan.localKey, plan.localDossierId);
    const result = journal.result;
    if (
      !result ||
      result.requestId !== plan.requestId ||
      result.status !== "completed" ||
      canonicalHash(result.paths) !==
        canonicalHash(plan.items.map((item) => item.path)) ||
      !Number.isSafeInteger(result.estimatedAllocatedBytes) ||
      result.estimatedAllocatedBytes < 0 ||
      typeof result.completedAt !== "string" ||
      !Number.isFinite(Date.parse(result.completedAt))
    )
      fail("legacy_operation_invalid");
    return result;
  }
  const dossier = readDossier(storage, plan.localKey);
  const actualManifest = readArtifacts(storage, dossier);
  if (
    dossier.meta?.localDossierId !== plan.localDossierId ||
    dossier.bodyHash !== journal.bodyHash
  )
    fail("document_conflict");
  const now = new Date().toISOString();
  const manifestAfter =
    journal.manifestAfter ?? structuredClone(journal.manifestBefore);
  if (!journal.manifestAfter) {
    manifestAfter.revision++;
    for (const item of journal.items) {
      const artifact = manifestAfter.artifacts.find(
        (a) => a.id === item.artifactId,
      );
      if (!artifact) fail("cleanup_owner_mismatch");
      artifact.state = "deleted";
    }
  }
  const taskAfter = journal.taskAfter ?? {
    ...journal.taskBefore,
    revision: journal.taskBefore.revision + 1,
    updatedAt: now,
  };
  /** @type {import("./WorkspaceCleanup.types").WorkspaceCleanupReceipt} */
  const result = journal.result ?? {
    requestId: plan.requestId,
    status: "completed",
    paths: journal.items.map((i) => i.path),
    estimatedAllocatedBytes: journal.items.reduce(
      (s, i) => s + i.snapshot.allocatedBytes,
      0,
    ),
    completedAt: now,
  };
  const taskBefore =
    canonicalHash(dossier.meta) === canonicalHash(journal.taskBefore);
  const taskDone = canonicalHash(dossier.meta) === canonicalHash(taskAfter);
  const manifestBefore =
    canonicalHash(actualManifest) === canonicalHash(journal.manifestBefore);
  const manifestDone =
    canonicalHash(actualManifest) === canonicalHash(manifestAfter);
  if (
    (!taskBefore && !taskDone) ||
    (!manifestBefore && !manifestDone) ||
    (taskDone && !manifestDone)
  )
    fail("cleanup_revision_conflict");
  if (journal.phase !== "publishing" && (!taskBefore || !manifestBefore))
    fail("cleanup_revision_conflict");
  const receiptPath = `${dossier.base}/logs/cleanup-results/${plan.requestId}.json`;
  if (
    storage.exists(receiptPath) &&
    (!taskDone ||
      !manifestDone ||
      storage.read(receiptPath).toString("utf8") !== cleanupJson(result))
  )
    fail("cleanup_revision_conflict");
  const writes = journal.metadataWrites ?? [
    {
      path: `${dossier.base}/artifact-manifest.json`,
      before: manifestBefore
        ? storage
            .read(`${dossier.base}/artifact-manifest.json`)
            .toString("utf8")
        : cleanupJson(journal.manifestBefore),
      after: cleanupJson(manifestAfter),
    },
    {
      path: `${dossier.base}/TASK.md`,
      before: taskBefore
        ? storage.read(`${dossier.base}/TASK.md`).toString("utf8")
        : serializeDossier(journal.taskBefore, dossier.body),
      after: serializeDossier(taskAfter, dossier.body),
    },
    { path: receiptPath, before: null, after: cleanupJson(result) },
  ];
  const cleanup = {
    ...journal,
    phase: journal.phase,
    requestId: plan.requestId,
    planPath: reference.planPath,
    localDossierId: plan.localDossierId,
    base: dossier.base,
    taskAfter,
    manifestAfter,
    writes,
    result,
  };
  const data = {
    cleanup,
    cleanupMetadataCursorWrites: writes,
    cleanupMetadataCursor:
      journal.metadataCursor ??
      (taskDone ? (storage.exists(receiptPath) ? 3 : 2) : manifestDone ? 1 : 0),
  };
  // Это представление в памяти. Файл остаётся legacy-формата; новый pending не создаётся.
  /** @type {import("./WorkspaceCleanup.types").WorkspaceCleanupResumeContext} */
  const facade = {
    ...ctx,
    journal: { phase: "prepared", key: plan.localKey, data },
    save() {
      Object.assign(journal, {
        phase: cleanup.phase,
        items: cleanup.items,
        taskAfter,
        manifestAfter,
        result,
        metadataWrites: writes,
        metadataCursor: data.cleanupMetadataCursor,
      });
      storage.writeJson(reference.path, journal);
    },
  };
  facade.save();
  return resumeWorkspaceCleanupOperation(storage, facade, options);
}
