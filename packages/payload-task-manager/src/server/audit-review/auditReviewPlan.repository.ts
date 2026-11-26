/**
 * @file packages/payload-task-manager/src/server/audit-review/auditReviewPlan.repository.ts
 * @version 1.2.1
 * @date 2026-11-26
 * @description Сверяет попытку, действующее назначение и права на входные материалы по сохранённому плану.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual as equal } from "node:util";
import type { Pool, PoolClient } from "pg";
import type {
  AuditTaskBinding,
  ReviewDelivery,
  ReviewTarget,
} from "./AuditPublication.types";
import type { AuditPlanInput } from "./AuditReviewPlan.types";
import { withAuditTransaction } from "./withAuditTransaction.repository";

export async function initializeAuditPlan(pool: Pool) {
  const schema = await readFile(
    new URL("./planSchema.sql", import.meta.url),
    "utf8",
  );
  await withAuditTransaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('realize.audit_review.plan_schema'))",
    );
    await client.query(schema);
  });
}

function validatePlan(plan: AuditPlanInput) {
  const { task, review, sourcePins, scopePins } = plan;
  const ids = [
    task.projectId,
    task.taskId,
    task.executionId,
    task.stageId,
    task.taskAssignmentId,
    review.stageId,
    review.assignmentId,
    plan.auditAttemptId,
    plan.auditorId,
    plan.implementationAuthorId,
    plan.reviewerId,
  ];
  const versions = [
    task.taskRevision,
    task.planRevision,
    task.assignmentRevision,
    review.assignmentRevision,
    review.iteration,
  ];
  const pins = Object.entries(sourcePins);
  const reviewFiles = Object.entries(scopePins);
  if (
    ids.some((id) => typeof id !== "string" || !id || id !== id.trim()) ||
    versions.some((n) => !Number.isSafeInteger(n) || n < 1) ||
    task.executionId !== review.executionId ||
    task.stageId === review.stageId ||
    task.taskAssignmentId === review.assignmentId ||
    reviewFiles.length === 0 ||
    pins.some(
      ([path, digest]) =>
        !path ||
        /[\\:\x00-\x1f\x7f]/u.test(path) ||
        path
          .split("/")
          .some((part) => !part || part === "." || part === "..") ||
        typeof digest !== "string" ||
        !/^[0-9a-f]{64}$/.test(digest),
    ) ||
    reviewFiles.some(
      ([path, digest]) =>
        !Object.hasOwn(sourcePins, path) || sourcePins[path] !== digest,
    )
  )
    throw new Error("invalid_audit_plan");
}

/** Строка execution сериализует изменения ACL/назначения с submit, claim и выдачей байтов. */
async function readPlan(client: PoolClient, task: AuditTaskBinding) {
  const result = await client.query<
    Omit<AuditPlanInput, "task"> & { active: boolean; withdrawn: boolean }
  >(
    `SELECT p.audit_attempt_id AS "auditAttemptId", p.implementation_author_id AS "implementationAuthorId",
      a.actor_id AS "auditorId", r.actor_id AS "reviewerId", r.withdrawn,
      p.source_pins AS "sourcePins", p.scope_pins AS "scopePins", e.active_revision = p.plan_revision AS active,
      jsonb_build_object('executionId',e.execution_id,'stageId',r.stage_id,'assignmentId',r.assignment_id,
                         'assignmentRevision',r.assignment_revision,'iteration',p.review_iteration) AS review
     FROM audit_review.executions e
     JOIN public.realize_tasks t ON t.task_id=e.task_id AND t.project_id=e.project_id
     JOIN audit_review.plans p ON e.execution_id=p.execution_id
     JOIN audit_review.assignments a ON (p.execution_id,p.plan_revision)=(a.execution_id,a.plan_revision) AND a.role='auditor'
     JOIN audit_review.assignments r ON (p.execution_id,p.plan_revision)=(r.execution_id,r.plan_revision) AND r.role='reviewer'
     WHERE e.execution_id=$1 AND e.project_id=$2 AND e.task_id=$3 AND p.plan_revision=$4 AND p.task_revision=$5
       AND a.stage_id=$6 AND a.assignment_id=$7 AND a.assignment_revision=$8
     FOR SHARE OF e, t, r`,
    [
      task.executionId,
      task.projectId,
      task.taskId,
      task.planRevision,
      task.taskRevision,
      task.stageId,
      task.taskAssignmentId,
      task.assignmentRevision,
    ],
  );
  return result.rows[0];
}

/** Повтор сверяет исторический снимок. Новая ревизия активируется вместе с двумя назначениями без наследования грантов. */
export async function saveAuditPlan(pool: Pool, input: AuditPlanInput) {
  const plan = structuredClone(input);
  validatePlan(plan);
  const { task, review } = plan;
  await withAuditTransaction(pool, async (client) => {
    const foundation = await client.query(
      "SELECT id FROM public.realize_tasks WHERE task_id=$1 AND project_id=$2 AND revision=$3 FOR SHARE",
      [task.taskId, task.projectId, task.taskRevision],
    );
    if (!foundation.rowCount) throw new Error("audit_task_mismatch");
    await client.query(
      "INSERT INTO audit_review.executions(execution_id,task_id,project_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [task.executionId, task.taskId, task.projectId],
    );
    const head = await client.query<{ active_revision: number | null }>(
      "SELECT active_revision FROM audit_review.executions WHERE execution_id=$1 AND task_id=$2 AND project_id=$3 FOR UPDATE",
      [task.executionId, task.taskId, task.projectId],
    );
    if (!head.rowCount) throw new Error("audit_plan_conflict");
    const active = head.rows[0].active_revision;
    if (active !== null && task.planRevision <= active) {
      const saved = await readPlan(client, task);
      if (!saved) throw new Error("audit_plan_conflict");
      const { active: _current, withdrawn: _withdrawn, ...registered } = saved;
      if (!equal(plan, { task, ...registered }))
        throw new Error("audit_plan_conflict");
      return;
    }
    if (active !== null && task.planRevision !== active + 1)
      throw new Error("audit_plan_conflict");
    const inserted = await client.query(
      `INSERT INTO audit_review.plans(execution_id,plan_revision,task_revision,audit_attempt_id,implementation_author_id,source_pins,scope_pins,review_iteration)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [
        task.executionId,
        task.planRevision,
        task.taskRevision,
        plan.auditAttemptId,
        plan.implementationAuthorId,
        plan.sourcePins,
        plan.scopePins,
        review.iteration,
      ],
    );
    if (!inserted.rowCount) throw new Error("audit_plan_conflict");
    await client.query(
      `INSERT INTO audit_review.assignments(execution_id,plan_revision,role,stage_id,assignment_id,assignment_revision,actor_id)
       VALUES ($1,$2,'auditor',$3,$4,$5,$6),($1,$2,'reviewer',$7,$8,$9,$10)`,
      [
        task.executionId,
        task.planRevision,
        task.stageId,
        task.taskAssignmentId,
        task.assignmentRevision,
        plan.auditorId,
        review.stageId,
        review.assignmentId,
        review.assignmentRevision,
        plan.reviewerId,
      ],
    );
    await client.query(
      "UPDATE audit_review.executions SET active_revision=$2 WHERE execution_id=$1",
      [task.executionId, task.planRevision],
    );
  });
}

async function lockCurrentRevision(client: PoolClient, executionId: string) {
  const found = await client.query<{ active_revision: number }>(
    "SELECT active_revision FROM audit_review.executions WHERE execution_id=$1 FOR UPDATE",
    [executionId],
  );
  if (!found.rowCount) throw new Error("review_assignment_unavailable");
  return found.rows[0].active_revision;
}

/** Доверенный владелец разрешает либо отзывает весь закреплённый набор для зарегистрированного участника. */
export async function setReviewAccess(
  pool: Pool,
  executionId: string,
  actorId: string,
  allowed: boolean,
) {
  if (typeof allowed !== "boolean") throw new Error("invalid_review_grant");
  await withAuditTransaction(pool, async (client) => {
    const rev = await lockCurrentRevision(client, executionId);
    // Отозванное разрешение закрывает и ранее опубликованные выходы этого исполнения.
    if (!allowed) {
      await client.query(
        "UPDATE audit_review.read_grants SET allowed=false WHERE execution_id=$1 AND actor_id=$2 AND allowed",
        [executionId, actorId],
      );
      return;
    }
    const saved = await client.query(
      `INSERT INTO audit_review.read_grants(execution_id,plan_revision,actor_id,allowed)
       SELECT DISTINCT execution_id,plan_revision,actor_id,$4::boolean FROM audit_review.assignments
       WHERE execution_id=$1 AND plan_revision=$2 AND actor_id=$3
       ON CONFLICT (execution_id,plan_revision,actor_id) DO UPDATE SET allowed=excluded.allowed`,
      [executionId, rev, actorId, allowed],
    );
    if (!saved.rowCount) throw new Error("review_access_denied");
  });
}

/** Снимает действующее назначение, сохраняя связь с исторической попыткой и опубликованным результатом. */
export async function withdrawReviewAssignment(
  pool: Pool,
  executionId: string,
  assignmentId: string,
) {
  await withAuditTransaction(pool, async (client) => {
    const revision = await lockCurrentRevision(client, executionId);
    const found = await client.query(
      "UPDATE audit_review.assignments SET withdrawn=true WHERE execution_id=$1 AND plan_revision=$2 AND role='reviewer' AND assignment_id=$3",
      [executionId, revision, assignmentId],
    );
    if (!found.rowCount) throw new Error("review_assignment_unavailable");
  });
}

/** Публикация относится к исторической попытке даже при последующем снятии ревьюера. */
export async function assertAuditOrigin(
  client: PoolClient,
  task: AuditTaskBinding,
  attemptId: string,
  sourcePins: Record<string, string>,
  scopePins: Record<string, string>,
) {
  const plan = await readPlan(client, task);
  if (
    !plan ||
    plan.auditAttemptId !== attemptId ||
    !equal(plan.sourcePins, sourcePins) ||
    !equal(plan.scopePins, scopePins)
  )
    throw new Error("audit_origin_mismatch");
}

async function hasGrant(
  client: PoolClient,
  task: AuditTaskBinding,
  actorId: string,
) {
  // Изменение membership Foundation обновляет ту же строку проекта. Блокировка действует до выдачи байтов/claim.
  const grant = await client.query(
    `SELECT g.allowed FROM audit_review.read_grants g, public.realize_task_projects p
     WHERE g.execution_id=$1 AND g.plan_revision=$2 AND g.actor_id=$3 AND g.allowed
       AND p.project_id=$4 AND p.record->>'id'=p.project_id
       AND (p.record->>'ownerId'=g.actor_id OR
            (jsonb_typeof(p.record->'memberIds')='array' AND (p.record->'memberIds') ? g.actor_id))
     FOR SHARE OF g,p`,
    [task.executionId, task.planRevision, actorId, task.projectId],
  );
  return grant.rowCount === 1;
}

async function currentReview(client: PoolClient, task: AuditTaskBinding) {
  const plan = await readPlan(client, task);
  if (!plan?.active || plan.withdrawn)
    throw new Error("review_assignment_unavailable");
  if (
    plan.reviewerId === plan.auditorId ||
    plan.reviewerId === plan.implementationAuthorId
  )
    throw new Error("review_independence_required");
  if (!(await hasGrant(client, task, plan.reviewerId)))
    throw new Error("review_access_denied");
  return plan;
}

/** Перед submit получатель определяется из плана, а grant проверяется под той же блокировкой. */
export async function resolveReviewTarget(
  client: PoolClient,
  task: AuditTaskBinding,
): Promise<ReviewTarget> {
  const plan = await currentReview(client, task);
  return plan.review;
}

/** Перед выдачей материалов права действующего участника проверяются в транзакции чтения. */
export async function assertReviewRead(
  client: PoolClient,
  task: AuditTaskBinding,
  actorId: string,
) {
  const plan = await readPlan(client, task);
  if (!plan) throw new Error("review_access_denied");
  const auditor = actorId === plan.auditorId;
  const reviewer =
    plan.active &&
    actorId === plan.reviewerId &&
    actorId !== plan.implementationAuthorId &&
    !plan.withdrawn;
  if ((!auditor && !reviewer) || !(await hasGrant(client, task, actorId)))
    throw new Error("review_access_denied");
}

/** У исходного плана одна действующая итерация и одна ссылка на её поручение. */
export async function assertReviewRoute(
  client: PoolClient,
  delivery: Pick<ReviewDelivery, "task" | "target" | "rework">,
) {
  const plan = await currentReview(client, delivery.task);
  const { rows } = await client.query<{ work_id: string; iteration: number }>(
    "SELECT work_id,iteration FROM audit_review.iteration_heads WHERE execution_id=$1 AND plan_revision=$2 FOR SHARE",
    [delivery.task.executionId, delivery.task.planRevision],
  );
  const head = rows[0];
  const target = head
    ? { ...plan.review, iteration: head.iteration }
    : plan.review;
  if (
    !equal(delivery.target, target) ||
    (delivery.rework?.workId ?? null) !== (head?.work_id ?? null)
  )
    throw new Error("review_assignment_unavailable");
  return plan.reviewerId;
}

/** Runtime передаёт серверную идентичность участника и материализованную работу под своей транзакцией claim. */
export async function assertReviewClaim(
  client: PoolClient,
  delivery: Pick<ReviewDelivery, "task" | "target" | "rework">,
  actorId: string,
) {
  if (actorId !== (await assertReviewRoute(client, delivery)))
    throw new Error("review_access_denied");
}
