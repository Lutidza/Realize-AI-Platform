/**
 * @file .ai/tools/worker-assignment/src/checkpoints/createAuditCheckpointState.service.ts
 * @version 1.1.2
 * @date 2026-11-26
 * @description Закрепляет источники, политику и связь назначения со снимком задачи при создании попытки.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { openAiChatPolicy } from "realize-ai-platform/model-providers/openai-chat-completions-policy";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import type { ApiAuditSelection } from "../adapters/ApiAuditSelection.types";
import { bindAssignment } from "../bindAssignment.service";
import { hashAuditText } from "./hashAuditText.util";
import type {
  AuditCheckpointState,
  AuditCheckpointIdentity,
  AuditTaskBinding,
} from "./AuditCheckpoint.types";

/** Снимок связывает план задачи с ревизией и файлами ревью проверенного назначения. */
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
    scopePins: bound.context.scopePins,
  };
  return { schemaVersion: 1, identity, history: [], status: "ready" };
}
