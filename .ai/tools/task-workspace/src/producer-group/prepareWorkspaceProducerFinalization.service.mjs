/**
 * @file .ai/tools/task-workspace/src/producer-group/prepareWorkspaceProducerFinalization.service.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Готовит settle, точный cleanup plan и итоговые записи producer-finalize до первого эффекта.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  planDossierMetadata,
  dossierAbsenceGuards,
} from "../dossier/Dossier.repository.mjs";
import { prepareWorkspaceSettlement } from "../artifacts/prepareWorkspaceSettlement.service.mjs";
import { prepareWorkspaceCleanupPlan } from "../cleanup/prepareWorkspaceCleanupPlan.service.mjs";
import { prepareWorkspaceCleanupOperation } from "../cleanup/prepareWorkspaceCleanupOperation.service.mjs";
import { planWorkspaceFile } from "../recovery/commitWorkspaceMetadata.service.mjs";
import { fail } from "../Workspace.error.mjs";

/**
 * Будущее состояние settle передаётся planner/apply как данные; запись откладывается до ctx.prepare.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupContext} initial
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} group
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupFinalizationInput} input
 * @param {string} requestId
 */
export function prepareWorkspaceProducerFinalization(
  storage,
  initial,
  group,
  input,
  requestId,
) {
  if (!input.quiescent) fail("producer_group_not_quiescent");
  const now = new Date().toISOString();
  const unsettled = initial.artifacts
    .filter((artifact) => !artifact.producer.settled)
    .map((artifact) => artifact.id);
  const settled = unsettled.length
    ? prepareWorkspaceSettlement(
        storage,
        initial.dossier,
        initial.manifest,
        { artifactIds: unsettled },
        { now },
      )
    : { meta: initial.dossier.meta, manifest: initial.manifest };
  const virtualDossier = { ...initial.dossier, meta: settled.meta };
  const paths = initial.artifacts
    .filter((artifact) => artifact.category === "temporary")
    .map((artifact) => artifact.path);
  /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerFinalizationCompleted} */
  const result = {
    status: "completed",
    settlement: "settled",
    phase: "completed",
    operation: null,
    artifactIds: [...group.artifactIds],
    cleanup: {
      status: input.cleanupTemporary ? "not_needed" : "not_requested",
      paths,
      planPath: null,
    },
  };
  /** @type {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerOperationData & {
   * cleanup?: import("../cleanup/WorkspaceCleanup.types.ts").WorkspaceCleanupOperation,
   * cleanupMetadataCursorWrites?: import("../recovery/WorkspaceOperation.types.ts").WorkspaceFileWrite[]
   * }} */
  const data = {
    absentPaths: dossierAbsenceGuards(initial.dossier),
    producer: {
      kind: "finalize",
      phase: "metadata",
      base: initial.dossier.base,
      artifactIds: [...group.artifactIds],
      artifacts: settled.manifest.artifacts.filter((artifact) =>
        group.artifactIds.includes(artifact.id),
      ),
      result,
    },
    producerMetadataCursorWrites: planDossierMetadata(
      storage,
      initial.dossier,
      settled.meta,
      settled.manifest,
    ),
  };
  if (input.cleanupTemporary && paths.length) {
    const planned = prepareWorkspaceCleanupPlan(
      storage,
      virtualDossier,
      settled.manifest,
      paths,
      undefined,
      { requestId, now },
    );
    if (storage.exists(planned.file)) fail("cleanup_plan_exists");
    const cleanup = prepareWorkspaceCleanupOperation(
      storage,
      planned.plan,
      planned.file,
      { dossier: virtualDossier, manifest: settled.manifest },
    );
    data.producerMetadataCursorWrites.push(
      planWorkspaceFile(
        storage,
        planned.file,
        JSON.stringify(planned.plan, null, 2) + "\n",
      ),
    );
    data.cleanup = cleanup;
    data.cleanupMetadataCursorWrites = cleanup.writes;
    result.cleanup = {
      status: "completed",
      paths,
      planPath: planned.file,
      receipt: cleanup.result,
    };
  }
  return { data, result };
}
