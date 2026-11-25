/**
 * @file packages/payload-task-manager/src/server/audit-review/dossier-view/readTaskAuditDossier.repository.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Возвращает оркестратору три проверенных материала одного решения из неизменяемого досье задачи.
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { Pool, PoolClient } from "pg";
import type { AuditDecision } from "../conclusions/ReviewAcceptance.types";
import type {
  PublishedConclusion,
  ReviewConclusionRow,
} from "../conclusions/ReviewConclusion.types";
import { readConclusionRow } from "../conclusions/readConclusionRevision.repository";
import { assertDecisionHistoryAccess } from "../conclusions/reviewAcceptanceBasis.repository";
import { withAuditTransaction } from "../withAuditTransaction.repository";
import { mapTaskAuditDossier } from "./mapTaskAuditDossier.mapper";
import { readDecisionReport } from "./readDecisionReport.repository";
import type { TaskAuditDossierView } from "./TaskAuditDossierView.types";

type AddressedDecision = ReviewConclusionRow & {
  audit_result_id: string;
  review_attempt_id: string;
  project_id: string;
  task_key: string;
  task_title: string;
  decision: AuditDecision;
};

function findAddressedDecision(
  client: PoolClient,
  trustedActorId: string,
  taskId: string,
  decisionId: string,
) {
  return client.query<AddressedDecision>(
    `SELECT c.result_id,c.manifest,c.content_sha256,c.audit_result_id,c.review_attempt_id,
        t.project_id,t.record->>'key' AS task_key,t.record->>'title' AS task_title,d.manifest AS decision
     FROM audit_acceptance.decisions d JOIN audit_acceptance.inbox i USING(conclusion_id)
     JOIN audit_conclusions.results c ON c.result_id=d.conclusion_id
     JOIN public.realize_tasks t ON t.task_id=c.task_id AND t.record->>'id'=t.task_id AND t.record->>'projectId'=t.project_id
     JOIN audit_dossier.results a ON a.result_id=c.audit_result_id AND a.task_id=t.task_id
     WHERE i.actor_id=$1 AND t.task_id=$2 AND d.decision_id=$3`,
    [trustedActorId, taskId, decisionId],
  );
}

function assertDecisionPins(
  row: AddressedDecision,
  c: PublishedConclusion,
  actorId: string,
  taskId: string,
  decisionId: string,
) {
  const d = row.decision,
    { basis, delivery } = c;
  if (
    d.decisionId !== decisionId ||
    d.actorId !== actorId ||
    d.taskId !== taskId ||
    d.conclusionId !== c.conclusionId ||
    d.conclusionRevision !== c.revision ||
    d.conclusionSha256 !== c.sha256 ||
    !equal(d.basis, basis) ||
    basis.orchestratorId !== actorId ||
    delivery.task.taskId !== taskId ||
    delivery.task.projectId !== row.project_id ||
    delivery.resultId !== row.audit_result_id ||
    c.reviewAttemptId !== row.review_attempt_id ||
    basis.executionId !== delivery.task.executionId ||
    basis.resultId !== delivery.resultId ||
    basis.resultRevision !== delivery.resultRevision ||
    basis.reviewAssignmentId !== delivery.target.assignmentId ||
    basis.reviewIteration !== delivery.target.iteration ||
    !row.task_key ||
    !row.task_title
  )
    throw new Error("audit_dossier_inconsistent");
}

/** trustedActorId передаёт сервер аутентификации. Одинаковый null скрывает чужую задачу, решение и отзыв полномочий. */
export async function readTaskAuditDossier(
  pool: Pool,
  trustedActorId: string,
  taskId: string,
  decisionId: string,
): Promise<TaskAuditDossierView | null> {
  if (
    !trustedActorId ||
    !taskId ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(decisionId)
  )
    return null;
  return withAuditTransaction(
    pool,
    async (client) => {
      const row = (
        await findAddressedDecision(client, trustedActorId, taskId, decisionId)
      ).rows[0];
      if (!row) return null;
      const conclusion = readConclusionRow(row);
      try {
        await assertDecisionHistoryAccess(
          client,
          conclusion.delivery,
          trustedActorId,
          "snapshot",
        );
      } catch (error) {
        if (
          error instanceof Error &&
          [
            "orchestrator_access_denied",
            "orchestrator_independence_required",
          ].includes(error.message)
        )
          return null;
        throw error;
      }
      assertDecisionPins(row, conclusion, trustedActorId, taskId, decisionId);
      const text = await readDecisionReport(client, conclusion);
      return mapTaskAuditDossier(
        row.task_key,
        row.task_title,
        text,
        conclusion,
        row.decision,
      );
    },
    "read_snapshot",
  );
}
