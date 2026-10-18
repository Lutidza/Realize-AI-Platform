/**
 * @file .ai/tools/task-workspace/src/artifacts/publishWorkspaceResult.service.mjs
 * @version 1.0.4
 * @date 2026-10-15
 * @description Сохраняет immutable manifest результата и его hash перед переходами Done и Closed.
 * @see documentation/specifications/task-management-execution.md
 */
import { workspaceResultSchema } from "@realize/payload-task-manager/workspace-contracts";
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
  planDossierMetadata,
  readArtifacts,
} from "../dossier/Dossier.repository.mjs";
import { hashBytes } from "../filesystem/canonicalHash.util.mjs";
import {
  verifyArtifact,
  verifyEvidence,
} from "./verifyWorkspaceEvidence.service.mjs";
import { withWorkspaceEvidencePhase } from "./withWorkspaceEvidencePhase.service.mjs";
import { fail } from "../Workspace.error.mjs";
import { assertWorkspaceOutputAvailable } from "./assertWorkspaceOutputAvailable.validator.mjs";
/**
 * Публикует очередной immutable результат и обновляет указатель досье.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {number} expectedRevision
 * @param {import("./WorkspaceEvidence.types").PublishWorkspaceResultInput} input
 * @param {Pick<import("../recovery/WorkspaceOperation.types.ts").WorkspaceMutationOptions, "operationId">} [options]
 * @returns {import("../dossier/Dossier.types").WorkspaceTask}
 */
export function publishWorkspaceResult(
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
      kind: "result",
      operationId: options.operationId,
      checkCompletedIdentity: (localDossierId) =>
        assertDossierIdentity(storage, key, localDossierId),
      input: { expectedRevision, input },
    },
    (ctx) => {
      if (ctx.journal) return resumeWorkspaceMetadataOperation(storage, ctx);
      if (
        !input ||
        Object.keys(input).some(
          (key) => !["summary", "artifacts", "checks"].includes(key),
        )
      )
        fail("invalid_result_input");

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
      const relative = `logs/results/${revision}.json`;
      assertWorkspaceOutputAvailable(
        manifest,
        [relative],
        "result_output_registered",
      );
      const result = workspaceResultSchema.parse({
        ...input,
        localDossierId: meta.localDossierId,
        criteriaHash: dossier.bodyHash,
        submittedAt: new Date().toISOString(),
        revision,
        schemaVersion: 1,
      });
      const referenced = withWorkspaceEvidencePhase(
        storage,
        dossier,
        (phase) => {
          for (const check of result.checks)
            verifyEvidence(
              storage,
              dossier,
              manifest,
              result.artifacts,
              check.evidence,
              phase,
            );
          return result.artifacts.map((ref) => {
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
            verifyArtifact(storage, dossier, art, phase);
            return art;
          });
        },
      );
      // Изменение retention начинается только после закрытия неизменной verification phase.
      for (const art of referenced)
        art.retention.referencedBy = [
          ...new Set([
            ...art.retention.referencedBy,
            `result:${result.revision}`,
          ]),
        ];
      const bytes = Buffer.from(JSON.stringify(result, null, 2) + "\n");
      const resultPath = `${dossier.base}/${relative}`;
      if (storage.exists(resultPath)) fail("result_output_exists");
      manifest.revision++;
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
      const writes = [
        planWorkspaceFile(storage, resultPath, bytes),
        ...planDossierMetadata(storage, dossier, meta, manifest),
      ];
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
