/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/reviewAcceptanceBasis.repository.ts
 * @version 1.2.1
 * @date 2026-11-26
 * @description Сверяет действующее основание приёмки и полномочия независимого оркестратора по данным проекта.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { PoolClient } from "pg";
import { assertPublishedDelivery } from "../AuditDossier.repository";
import type { ReviewDelivery } from "../AuditPublication.types";
import { assertReviewRoute } from "../auditReviewPlan.repository";
import { assertIterationDelivery } from "../rework/reviewIterationDelivery.repository";
import type { AcceptanceSettings } from "./ReviewAcceptance.types";
import type { ReviewBasis } from "./ReviewConclusion.types";

/** Запись Foundation и назначения удерживаются до конца выдачи материалов или фиксации решения. */
export async function acceptanceActors(
  client: PoolClient,
  delivery: ReviewDelivery,
  candidateId: string,
  currentPlan = false,
  readMode: "lock" | "snapshot" = "lock",
) {
  const { task } = delivery;
  const result = await client.query<{
    ownerId: string;
    member: boolean;
    auditorId: string;
    reviewerId: string;
    authorId: string;
    taskRevision: number;
  }>(
    `
    SELECT pr.owner_id AS "ownerId", (pr.owner_id=$5 OR (jsonb_typeof(pr.record->'memberIds')='array'
      AND (pr.record->'memberIds') ? $5::text)) AS member, t.revision::int AS "taskRevision",
      a.actor_id AS "auditorId", r.actor_id AS "reviewerId", p.implementation_author_id AS "authorId"
    FROM public.realize_tasks t JOIN public.realize_task_projects pr ON pr.project_id=t.project_id
    JOIN audit_review.executions e ON e.task_id=t.task_id AND e.project_id=pr.project_id
    JOIN audit_review.plans p ON p.execution_id=e.execution_id
    JOIN audit_review.assignments a ON (a.execution_id,a.plan_revision)=(p.execution_id,p.plan_revision) AND a.role='auditor'
    JOIN audit_review.assignments r ON (r.execution_id,r.plan_revision)=(p.execution_id,p.plan_revision) AND r.role='reviewer'
    WHERE t.task_id=$1 AND pr.project_id=$2 AND e.execution_id=$3
      AND p.plan_revision=CASE WHEN $6::boolean THEN e.active_revision ELSE $4::integer END
      AND pr.record->>'id'=pr.project_id AND pr.record->>'ownerId'=pr.owner_id
    ` + (readMode === "lock" ? "FOR SHARE OF t,pr,e,p,a,r" : ""),
    [
      task.taskId,
      task.projectId,
      task.executionId,
      task.planRevision,
      candidateId,
      currentPlan,
    ],
  );
  const actors = result.rows[0];
  if (!actors?.member) throw new Error("orchestrator_access_denied");
  if (
    [actors.auditorId, actors.reviewerId, actors.authorId].includes(candidateId)
  )
    throw new Error("orchestrator_independence_required");
  return actors;
}

/** Историческое решение остаётся доступно своему адресату по текущей делегации даже при замене критериев и входа. */
export async function assertDecisionHistoryAccess(
  client: PoolClient,
  delivery: ReviewDelivery,
  actorId: string,
  readMode: "lock" | "snapshot" = "lock",
) {
  const actors = await acceptanceActors(
    client,
    delivery,
    actorId,
    true,
    readMode,
  );
  const saved = (await loadBasis(client, delivery.task.executionId, readMode))
    .rows[0];
  if (
    saved?.basis.orchestratorId !== actorId ||
    saved.grantor_id !== actors.ownerId
  )
    throw new Error("orchestrator_access_denied");
}

async function currentDelivery(client: PoolClient, delivery: ReviewDelivery) {
  await assertReviewRoute(client, delivery);
  await assertPublishedDelivery(client, delivery);
}

function loadBasis(
  client: PoolClient,
  executionId: string,
  readMode: "lock" | "snapshot" = "lock",
) {
  return client.query<{ grantor_id: string; basis: ReviewBasis }>(
    "SELECT grantor_id,basis FROM audit_acceptance.bases WHERE execution_id=$1" +
      (readMode === "lock" ? " FOR SHARE" : ""),
    [executionId],
  );
}

/** Владелец проекта выбирает независимого получателя и утверждает точные версии политики, критериев и входа. */
export async function configureAcceptance(
  client: PoolClient,
  ownerId: string,
  delivery: ReviewDelivery,
  settings: AcceptanceSettings,
  expectedRevision: number,
) {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    !settings.orchestratorId?.trim() ||
    !/^[0-9a-f]{64}$/.test(settings.criteriaSha256) ||
    !/^[0-9a-f]{64}$/.test(settings.policySha256)
  )
    throw new Error("invalid_review_basis");
  const executionId = delivery.task.executionId;
  // Исключительная блокировка берётся до чтения плана. Смена основания и чтения с FOR SHARE упорядочены.
  await client.query(
    "SELECT execution_id FROM audit_review.executions WHERE execution_id=$1 FOR UPDATE",
    [executionId],
  );
  await currentDelivery(client, delivery);
  const actors = await acceptanceActors(
    client,
    delivery,
    settings.orchestratorId,
  );
  if (!ownerId || actors.ownerId !== ownerId)
    throw new Error("orchestrator_access_denied");
  const saved = (await loadBasis(client, executionId)).rows[0];
  const revision = saved?.basis.revision ?? 0;
  const basis: ReviewBasis = {
    executionId,
    resultId: delivery.resultId,
    resultRevision: delivery.resultRevision,
    reviewAssignmentId: delivery.target.assignmentId,
    reviewIteration: delivery.target.iteration,
    criteriaSha256: settings.criteriaSha256,
    policySha256: settings.policySha256,
    orchestratorId: settings.orchestratorId,
    revision: revision + 1,
  };
  if (
    saved?.grantor_id === ownerId &&
    equal({ ...basis, revision }, saved.basis)
  )
    return saved.basis;
  if (expectedRevision !== revision) throw new Error("review_basis_conflict");
  await client.query(
    `INSERT INTO audit_acceptance.bases(execution_id,revision,grantor_id,basis) VALUES($1,$2,$3,$4)
      ON CONFLICT(execution_id) DO UPDATE SET revision=EXCLUDED.revision, grantor_id=EXCLUDED.grantor_id, basis=EXCLUDED.basis`,
    [executionId, basis.revision, ownerId, basis],
  );
  return basis;
}

/** Снимок на старте и сверка при публикации, доставке и решении используют один источник полномочий. */
export async function assertAcceptanceBasis(
  client: PoolClient,
  delivery: ReviewDelivery,
  expected?: ReviewBasis,
) {
  await currentDelivery(client, delivery);
  const saved = (await loadBasis(client, delivery.task.executionId)).rows[0];
  if (!saved) throw new Error("review_basis_unavailable");
  const { basis } = saved;
  if (
    delivery.rework &&
    !equal(await assertIterationDelivery(client, delivery), basis)
  )
    throw new Error("review_basis_stale");
  if (
    basis.resultId !== delivery.resultId ||
    basis.resultRevision !== delivery.resultRevision ||
    basis.reviewAssignmentId !== delivery.target.assignmentId ||
    basis.reviewIteration !== delivery.target.iteration ||
    (expected && !equal(expected, basis))
  )
    throw new Error("review_basis_stale");
  const actors = await acceptanceActors(client, delivery, basis.orchestratorId);
  if (actors.ownerId !== saved.grantor_id)
    throw new Error("orchestrator_access_denied");
  return basis;
}

/** Закрытый материал виден только текущему независимому получателю с действующей делегацией владельца. */
export async function assertOrchestratorRead(
  client: PoolClient,
  delivery: ReviewDelivery,
  actorId: string,
) {
  try {
    const basis = await assertAcceptanceBasis(client, delivery);
    if (basis.orchestratorId !== actorId)
      throw new Error("orchestrator_access_denied");
    return basis;
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "review_basis_stale",
        "review_basis_unavailable",
        "review_assignment_unavailable",
        "review_access_denied",
        "review_independence_required",
        "orchestrator_independence_required",
        "audit_delivery_conflict",
      ].includes(error.message)
    )
      throw new Error("orchestrator_access_denied");
    throw error;
  }
}
