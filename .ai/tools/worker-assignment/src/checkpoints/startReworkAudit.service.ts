/**
 * @file .ai/tools/worker-assignment/src/checkpoints/startReworkAudit.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Открывает собственную попытку аудитора с поручением, прежним отчётом и закреплённым основанием.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import { isDeepStrictEqual } from "node:util";
import { bindAssignment } from "../bindAssignment.service";
import type { ReworkInboxRepository } from "@realize/payload-task-manager/audit-review";
import type { RepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/RepositoryRead.types";
import type { ApiAuditSelection } from "../adapters/ApiAuditSelection.types";
import type { PostgresCheckpointStore } from "./PostgresCheckpoint.repository";
import { createAuditCheckpointState } from "./createAuditCheckpointState.service";
import { hashAuditText } from "./hashAuditText.util";

export async function startReworkAudit(
  inbox: ReworkInboxRepository,
  store: PostgresCheckpointStore,
  actorId: string,
  workId: string,
  policy: RepositoryReadPolicy,
  selection: ApiAuditSelection,
) {
  const { attemptId, parent } = await inbox.claim(actorId, workId);
  const input = await inbox.readAuditInput(actorId, workId, attemptId);
  const bound = await bindAssignment(
    policy,
    selection.lockPath,
    selection.contextId,
  );
  if (
    !bound.context ||
    !isDeepStrictEqual(bound.context.readPins, input.sourcePins)
  )
    throw new Error("rework_source_mismatch");
  const state = await createAuditCheckpointState(
    policy,
    selection,
    parent.delivery.task,
  );
  state.identity.rework = {
    actorId,
    workId,
    inputSha256: hashAuditText(JSON.stringify(input)),
  };
  return store.create(attemptId, state);
}
