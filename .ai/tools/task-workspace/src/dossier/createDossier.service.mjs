/**
 * @file .ai/tools/task-workspace/src/dossier/createDossier.service.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Создаёт или явно принимает legacy досье без потери тела и без выдуманных серверных IDs.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import { workspaceTaskSchema } from "@realize/payload-task-manager/workspace-contracts";
import { safeTaskKey } from "../filesystem/safeTaskKey.validator.mjs";
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import { resumeWorkspaceMetadataOperation } from "../recovery/commitWorkspaceMetadata.service.mjs";
import {
  readDossier,
  assertDossierIdentity,
  prepareDossierInitialization,
} from "./Dossier.repository.mjs";
import { fail } from "../Workspace.error.mjs";
/**
 * Создаёт managed-досье либо принимает существующее legacy-тело.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./Dossier.types").CreateWorkspaceDossierInput} input
 * @param {boolean} [adopt]
 * @param {Pick<import("../recovery/WorkspaceOperation.types.ts").WorkspaceMutationOptions, "operationId"> & {localDossierId?:string}} [options] Внутренний UUID seed связывает fallback с уже сохранённым clientTaskId; CLI flag для него отсутствует.
 * @returns {import("../dossier/Dossier.types").WorkspaceTask}
 */
export function createDossier(storage, input, adopt = false, options = {}) {
  const key = safeTaskKey(input.key);
  return withWorkspaceMutation(
    storage,
    key,
    {
      kind: adopt ? "adopt" : "create",
      operationId: options.operationId,
      checkCompletedIdentity: (localDossierId) => {
        if (options.localDossierId && options.localDossierId !== localDossierId)
          fail("operation_identity_conflict");
        assertDossierIdentity(storage, key, localDossierId);
      },
      input: options.localDossierId
        ? { ...input, localDossierId: options.localDossierId }
        : input,
    },
    (ctx) => {
      if (ctx.journal) return resumeWorkspaceMetadataOperation(storage, ctx);
      if (
        adopt
          ? input.category !== "open" && input.category !== "active"
          : input.category !== undefined
      )
        fail("invalid_adoption_category");

      const previous = adopt ? readDossier(storage, key) : undefined;
      const now = new Date().toISOString();
      const body = previous
        ? previous.body
        : (input.body ??
          `# ${input.title}\n\n## Цель\n\n## Область и ограничения\n\n## Критерии и проверки\n\n## Результат и ограничения\n\n## Следующий шаг\n`);
      if (Buffer.byteLength(body) > 512 * 1024) fail("body_limit");
      const meta = workspaceTaskSchema.parse({
        schemaVersion: 1,
        localDossierId: options.localDossierId ?? randomUUID(),
        localKey: key,
        revision: 1,
        title: input.title,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        archivedAt: null,
        status: {
          id: `local:${input.category ?? "open"}`,
          category: input.category ?? "open",
        },
        outcome: null,
        execution: {
          state: null,
          runtimeRef: null,
          stageId: null,
          attemptId: null,
        },
        acceptance: {
          required: input.acceptanceRequired ?? false,
          state: input.acceptanceRequired ? "pending" : "not_requested",
          resultHash: null,
          criteriaHash: null,
          decidedAt: null,
        },
        delivery: {
          required: input.deliveryRequired ?? false,
          state: input.deliveryRequired ? "pending" : "not_requested",
          evidence: [],
        },
        requiredChecks: input.requiredChecks ?? [],
        result: null,
        taskRef: null,
        legacy: previous
          ? { originalBodyHash: previous.bodyHash, recordedAt: now }
          : null,
      });
      const { writes, absentPaths } = prepareDossierInitialization(
        storage,
        meta,
        body,
        previous,
      );
      ctx.prepare({
        localDossierId: meta.localDossierId,
        data: { writes, absentPaths, result: meta },
        result: meta,
      });
      return resumeWorkspaceMetadataOperation(storage, ctx);
    },
  );
}
