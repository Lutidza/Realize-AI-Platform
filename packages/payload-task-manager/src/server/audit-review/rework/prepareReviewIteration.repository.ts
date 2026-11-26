/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/prepareReviewIteration.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Связывает исполненное поручение, новую итерацию и точные входы ревью в одной транзакции.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { PoolClient } from "pg";
import type { ReviewDelivery } from "../AuditPublication.types";
import { assertAcceptanceBasis } from "../conclusions/reviewAcceptanceBasis.repository";
import {
  completeReworkClaim,
  requireReworkClaim,
} from "./reworkClaim.repository";
import {
  readAuditRevisionForWork,
  readAuditRevisionLink,
} from "./auditRevisionLinks.repository";
import { readIterationRoute } from "./reviewIterationDelivery.repository";
import { reviewReworkContext } from "./readReworkContext.repository";

async function prepareInputs(
  client: PoolClient,
  claim: Awaited<ReturnType<typeof requireReworkClaim>>,
) {
  const { work, parent } = claim,
    old = parent.delivery;
  const delivery: ReviewDelivery = {
    task: old.task,
    resultId: old.resultId,
    resultRevision: old.resultRevision,
    report: old.report,
    coverage: old.coverage,
    target: { ...old.target, iteration: work.nextIteration },
    rework: {
      workId: work.workId,
      kind: work.action,
      parentConclusionId: parent.conclusionId,
      parentConclusionRevision: parent.revision,
      parentConclusionSha256: parent.sha256,
      conclusionRevision: parent.revision + 1,
    },
  };
  if (work.action === "return_audit") {
    const updated = await readAuditRevisionForWork(client, work.workId);
    if (!updated) throw new Error("audit_revision_unavailable");
    const origin = await readAuditRevisionLink(client, updated.resultId);
    if (
      !origin ||
      origin.workId !== work.workId ||
      origin.parentResultId !== old.resultId ||
      origin.parentRevision !== old.resultRevision ||
      origin.conclusionId !== parent.conclusionId ||
      origin.parentConclusionSha256 !== parent.sha256 ||
      origin.parentConclusionRevision !== parent.revision ||
      origin.iteration !== work.nextIteration ||
      origin.decisionId !== work.decisionId ||
      !equal(old.task, updated.task)
    )
      throw new Error("review_rework_mismatch");
    Object.assign(delivery, {
      resultId: updated.resultId,
      resultRevision: updated.resultRevision,
      report: updated.report,
      coverage: updated.coverage,
    });
  }
  await reviewReworkContext(client, delivery);
  return delivery;
}

/** Порядок блокировок общий для двух диспетчеров. До выдачи результата наружу все разрешения сверяются заново. */
export async function prepareReviewIteration(
  client: PoolClient,
  actorId: string,
  workId: string,
) {
  const addressed = await client.query<{ execution_id: string }>(
    `
    SELECT d.manifest #>> '{basis,executionId}' AS execution_id FROM audit_acceptance.work w
    JOIN audit_acceptance.decisions d USING(decision_id) WHERE w.work_id=$1 AND w.record->>'assigneeId'=$2
    FOR UPDATE OF w`,
    [workId, actorId],
  );
  const executionId = addressed.rows[0]?.execution_id;
  if (!executionId) throw new Error("rework_access_denied");
  await client.query(
    "SELECT execution_id FROM audit_review.executions WHERE execution_id=$1 FOR UPDATE",
    [executionId],
  );
  const claim = await requireReworkClaim(client, actorId, workId);
  const saved = await readIterationRoute(client, workId);
  if (saved) {
    await assertAcceptanceBasis(client, saved.envelope, saved.basis);
    return saved.envelope;
  }
  const { parent } = claim;
  const original = await assertAcceptanceBasis(
    client,
    parent.delivery,
    parent.basis,
  );
  const delivery = await prepareInputs(client, claim);
  const { iteration } = delivery.target,
    { planRevision } = delivery.task;
  const basis = {
    ...original,
    revision: original.revision + 1,
    resultId: delivery.resultId,
    resultRevision: delivery.resultRevision,
    reviewIteration: iteration,
  };
  await client.query(
    `INSERT INTO audit_rework.review_routes(work_id,execution_id,plan_revision,iteration,envelope,basis)
      VALUES($1,$2,$3,$4,$5,$6)`,
    [workId, executionId, planRevision, iteration, delivery, basis],
  );
  const head = await client.query(
    `INSERT INTO audit_review.iteration_heads(execution_id,plan_revision,work_id,iteration)
    VALUES($1,$2,$3,$4) ON CONFLICT(execution_id,plan_revision) DO UPDATE SET work_id=EXCLUDED.work_id, iteration=EXCLUDED.iteration
    WHERE audit_review.iteration_heads.iteration=$5`,
    [
      executionId,
      planRevision,
      workId,
      iteration,
      parent.delivery.target.iteration,
    ],
  );
  if (head.rowCount !== 1) throw new Error("review_basis_stale");
  const updated = await client.query(
    `UPDATE audit_acceptance.bases SET revision=$2,basis=$3
    WHERE execution_id=$1 AND basis=$4::jsonb`,
    [executionId, basis.revision, basis, original],
  );
  if (updated.rowCount !== 1) throw new Error("review_basis_stale");
  await assertAcceptanceBasis(client, delivery, basis);
  await completeReworkClaim(client, workId);
  return delivery;
}
