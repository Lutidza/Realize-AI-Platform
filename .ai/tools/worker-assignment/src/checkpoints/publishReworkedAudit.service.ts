/**
 * @file .ai/tools/worker-assignment/src/checkpoints/publishReworkedAudit.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Передаёт подтверждённые чтения и исправленный отчёт в досье по поручению из исходной попытки.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import type { AuditReworkRepository } from "@realize/payload-task-manager/audit-review";
import type { RepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/RepositoryRead.types";
import type { PostgresCheckpointStore } from "./PostgresCheckpoint.repository";
import { publishReceivedAudit } from "./publishReceivedAudit.service";

export async function publishReworkedAudit(
  store: PostgresCheckpointStore,
  repository: AuditReworkRepository,
  actorId: string,
  attemptId: string,
  policy: RepositoryReadPolicy,
  responses: Parameters<AuditReworkRepository["publish"]>[3],
) {
  const { state } = await store.get(attemptId);
  const rework = state.identity.rework;
  if (!rework || rework.actorId !== actorId)
    throw new Error("rework_attempt_mismatch");
  return publishReceivedAudit(
    store,
    {
      publish: (input) =>
        repository.publish(actorId, rework.workId, input, responses),
    },
    attemptId,
    policy,
  );
}
