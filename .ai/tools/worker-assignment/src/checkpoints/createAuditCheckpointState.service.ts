/**
 * @file .ai/tools/worker-assignment/src/checkpoints/createAuditCheckpointState.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Закрепляет источники, политику и связь назначения со снимком задачи при создании попытки.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { openAiChatPolicy } from "../../../../../services/ai-control-plane/src/model-providers/openaiChatCompletions.policy";
import type { RepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/RepositoryRead.types";
import type { ApiAuditSelection } from "../adapters/ApiAuditSelection.types";
import { bindAssignment } from "../bindAssignment.service";
import { readAssignmentDefinition } from "../readAssignmentDefinition.service";
import { hashAuditText } from "./hashAuditText.util";
import type {
  AuditCheckpointState,
  AuditCheckpointIdentity,
  AuditTaskBinding,
} from "./AuditCheckpoint.types";

/** Снимок привязывает план задачи к версии манифеста и его двенадцати файлам ревью. */
export async function createAuditCheckpointState(
  policy: RepositoryReadPolicy,
  selection: ApiAuditSelection,
  task: AuditTaskBinding,
): Promise<AuditCheckpointState> {
  const refs = [
    task.projectId,
    task.taskId,
    task.executionId,
    task.stageId,
    task.taskAssignmentId,
  ];
  const revisions = [
    task.taskRevision,
    task.planRevision,
    task.assignmentRevision,
  ];
  if (
    !selection.contextId ||
    !selection.model ||
    refs.some((id) => typeof id !== "string" || !id.trim()) ||
    revisions.some(
      (revision) => !Number.isSafeInteger(revision) || revision < 1,
    )
  )
    throw new Error("invalid_task_binding");
  const bound = await bindAssignment(
    policy,
    selection.lockPath,
    selection.contextId,
  );
  if (!bound.context)
    throw new Error(bound.report.issues[0]?.code ?? "context_unavailable");
  const definition = await readAssignmentDefinition(policy, selection.lockPath);
  if (
    definition.lockSha256 !== bound.report.lockSha256 ||
    definition.scope.length !== 12
  )
    throw new Error("scope_mismatch");
  const identity: AuditCheckpointIdentity = {
    task,
    selection,
    executor: {
      adapterId: openAiChatPolicy.adapterId,
      providerId: openAiChatPolicy.providerId,
      selection: { kind: "model", id: selection.model },
    },
    policyRevision: openAiChatPolicy.revision,
    assignmentId: bound.report.assignmentId,
    revision: bound.report.revision,
    lockSha256: bound.report.lockSha256,
    inputSha256: hashAuditText(bound.context.initialInput),
    scopePins: Object.fromEntries(
      definition.scope.map((path) => [path, bound.context.readPins[path]]),
    ),
  };
  return { schemaVersion: 1, identity, history: [], status: "ready" };
}
