/**
 * @file .ai/tools/task-workspace/src/producer-group/beginWorkspaceProducerGroup.service.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Создаёт зарегистрированную producer-группу по единому долговечному плану каталогов и metadata.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import {
  readArtifacts,
  planDossierMetadata,
  assertDossierIdentity,
  dossierAbsenceGuards,
} from "../dossier/Dossier.repository.mjs";
import { prepareWorkspaceRegistration } from "../artifacts/prepareWorkspaceRegistration.service.mjs";
import { validateWorkspaceArtifactPath } from "../artifacts/validateWorkspaceArtifactPath.validator.mjs";
import { withWorkspaceMutation } from "../recovery/withWorkspaceMutation.service.mjs";
import { fail } from "../Workspace.error.mjs";
import {
  bindProducerGroup,
  requireProducerDossier,
} from "./WorkspaceProducerGroup.repository.mjs";
import {
  planProducerDirectories,
  emptyProducerDirectorySnapshot,
} from "./createProducerDirectories.adapter.mjs";
import { resumeWorkspaceProducerOperation } from "./resumeWorkspaceProducerOperation.service.mjs";

/**
 * Все эффекты сохраняются одной операцией до mkdir. При прерывании ошибка содержит
 * ссылку recovery; восстановление завершает регистрацию, но не создаёт process-local handle.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupInput} input
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup}
 */
export function beginWorkspaceProducerGroup(storage, key, input) {
  if (
    !input ||
    Object.keys(input).some(
      (name) => !["stageId", "attemptId", "artifacts"].includes(name),
    ) ||
    !Array.isArray(input.artifacts) ||
    !input.artifacts.length ||
    input.artifacts.length > 1024
  )
    fail("invalid_producer_group");
  return withWorkspaceMutation(
    storage,
    key,
    {
      kind: "producer-begin",
      operationId: randomUUID(),
      input,
      checkCompletedIdentity: (id) => assertDossierIdentity(storage, key, id),
    },
    (ctx) => {
      const dossier = requireProducerDossier(storage, key);
      const manifest = readArtifacts(storage, dossier);
      const producerId = `group:${randomUUID()}`;
      /** @type {import("../artifacts/WorkspaceArtifacts.types.ts").WorkspaceArtifactRegistration[]} */
      const artifacts = input.artifacts.map((artifact) => {
        if (
          !artifact ||
          Object.keys(artifact).some(
            (name) => !["path", "category", "retention"].includes(name),
          )
        )
          fail("invalid_producer_group");
        validateWorkspaceArtifactPath(artifact, manifest);
        return {
          ...artifact,
          stageId: input.stageId ?? null,
          attemptId: input.attemptId ?? null,
          producer: { id: producerId, pid: null, settled: false },
          retention: artifact.retention ?? {
            mode: artifact.category === "temporary" ? "temporary" : "retain",
            pinned: false,
            keepReason: null,
            referencedBy: [],
          },
        };
      });
      const paths = artifacts.map((artifact) => artifact.path);
      if (
        new Set(paths).size !== paths.length ||
        paths.some((a) => paths.some((b) => a !== b && b.startsWith(a + "/")))
      )
        fail("overlapping_producer_paths");
      const directories = planProducerDirectories(storage, dossier.base, paths);
      const prepared = prepareWorkspaceRegistration(
        storage,
        dossier,
        manifest,
        { artifacts },
        {
          now: new Date().toISOString(),
          captureSnapshot: false,
          emptyDirectorySnapshot: emptyProducerDirectorySnapshot(),
        },
      );
      const records = prepared.manifest.artifacts.filter(
        (artifact) => artifact.producer.id === producerId,
      );
      const result = {
        localKey: dossier.meta.localKey,
        localDossierId: dossier.meta.localDossierId,
        stageId: input.stageId ?? null,
        attemptId: input.attemptId ?? null,
        artifactIds: records.map((artifact) => artifact.id),
        paths,
      };
      ctx.prepare({
        localDossierId: dossier.meta.localDossierId,
        data: {
          absentPaths: dossierAbsenceGuards(dossier),
          producer: {
            kind: "begin",
            phase: "directories",
            base: dossier.base,
            directories,
            artifacts: records,
            result,
          },
          producerMetadataCursorWrites: planDossierMetadata(
            storage,
            dossier,
            prepared.meta,
            prepared.manifest,
          ),
        },
        result,
      });
      resumeWorkspaceProducerOperation(storage, ctx);
      ctx.complete(result);
      // Только исходный begin выдаёт привязанный handle; journal recovery возвращает обычные данные.
      return bindProducerGroup(
        requireProducerDossier(storage, key),
        input,
        records,
      );
    },
  );
}
