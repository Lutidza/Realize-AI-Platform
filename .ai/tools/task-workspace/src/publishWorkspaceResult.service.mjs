/**
 * @file .ai/tools/task-workspace/src/publishWorkspaceResult.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Сохраняет immutable manifest результата и его hash перед переходами Done и Closed.
 * @see documentation/specifications/task-management-execution.md
 */
import { workspaceResultSchema } from "@realize/payload-task-manager/workspace-contracts";
import { withWorkspaceLock } from "./withWorkspaceLock.adapter.mjs";
import {
  readDossier,
  requireManaged,
  writeDossier,
  readArtifacts,
  writeArtifacts,
} from "./Dossier.repository.mjs";
import { hashBytes } from "./hashWorkspaceTree.adapter.mjs";
import {
  verifyArtifact,
  verifyEvidence,
} from "./workspaceLifecycle.validator.mjs";
import { fail } from "./Workspace.error.mjs";
export function publishWorkspaceResult(storage, key, expectedRevision, input) {
  if (
    !input ||
    Object.keys(input).some(
      (key) => !["summary", "artifacts", "checks"].includes(key),
    )
  )
    fail("invalid_result_input");
  return withWorkspaceLock(storage, key, () => {
    const dossier = readDossier(storage, key);
    const meta = structuredClone(requireManaged(dossier, expectedRevision));
    if (meta.archivedAt || meta.status.category === "closed")
      fail("reopen_required");
    const manifest = readArtifacts(storage, dossier);
    // Сохранённый orphan manifest после сбоя остаётся evidence; новая сдача не перезаписывает его номер.
    const resultRoot = `${dossier.base}/logs/results`;
    const saved = storage.exists(resultRoot)
      ? storage
          .list(resultRoot)
          .filter((n) => /^[1-9][0-9]*\.json$/.test(n))
          .map((n) => Number(n.slice(0, -5)))
      : [];
    if (saved.length > 4096 || saved.some((n) => !Number.isSafeInteger(n)))
      fail("result_revision_limit");
    const revision = Math.max(meta.result?.revision ?? 0, ...saved) + 1;
    const result = workspaceResultSchema.parse({
      ...input,
      localDossierId: meta.localDossierId,
      criteriaHash: dossier.bodyHash,
      submittedAt: new Date().toISOString(),
      revision,
      schemaVersion: 1,
    });
    for (const check of result.checks)
      verifyEvidence(
        storage,
        dossier,
        manifest,
        result.artifacts,
        check.evidence,
      );
    for (const ref of result.artifacts) {
      const art = manifest.artifacts.find(
        (a) => a.id === ref.id && a.revision === ref.revision,
      );
      if (
        !art ||
        art.hash !== ref.hash ||
        art.state !== "ready" ||
        art.retention.mode !== "retain"
      )
        fail("result_artifact_not_durable");
      verifyArtifact(storage, dossier, art);
      art.retention.referencedBy = [
        ...new Set([
          ...art.retention.referencedBy,
          `result:${result.revision}`,
        ]),
      ];
    }
    const relative = `logs/results/${result.revision}.json`;
    const bytes = Buffer.from(JSON.stringify(result, null, 2) + "\n");
    storage.write(`${dossier.base}/${relative}`, bytes, true);
    manifest.revision++;
    writeArtifacts(storage, dossier, manifest);
    meta.result = {
      path: relative,
      hash: hashBytes(bytes),
      criteriaHash: dossier.bodyHash,
      revision: result.revision,
    };
    meta.acceptance = {
      ...meta.acceptance,
      state: meta.acceptance.required ? "pending" : "not_requested",
      resultHash: null,
      criteriaHash: null,
      decidedAt: null,
    };
    meta.revision++;
    meta.updatedAt = result.submittedAt;
    return writeDossier(storage, dossier, meta).meta;
  });
}
