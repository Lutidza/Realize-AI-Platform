/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/ReviewIteration.repository.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Предоставляет диспетчеру незавершённые выдачи повторного ревью и фиксирует квитанции очереди.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { ReviewDelivery } from "../AuditPublication.types";
import { withAuditTransaction } from "../withAuditTransaction.repository";
import { assertQueueDelivery } from "./assertQueueDelivery.repository";
import { prepareReviewIteration } from "./prepareReviewIteration.repository";

export class ReviewIterationRepository {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    const schema = await readFile(
      new URL("./reviewIterationSchema.sql", import.meta.url),
      "utf8",
    );
    await withAuditTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize.review_iterations'))",
      );
      await client.query(schema);
    });
  }

  prepareNextReview(actorId: string, workId: string): Promise<ReviewDelivery> {
    return withAuditTransaction(this.pool, (client) =>
      prepareReviewIteration(client, actorId, workId),
    );
  }

  /** Закрытый серверный опрос включает сбой до записи маршрута и сбой после приёма задания очередью. */
  pendingReviews(): Promise<{ workId: string; actorId: string }[]> {
    return withAuditTransaction(
      this.pool,
      async (client) =>
        (
          await client.query<{ workId: string; actorId: string }>(`
      SELECT c.work_id AS "workId", c.actor_id AS "actorId" FROM audit_rework.claims c
      JOIN audit_acceptance.work w USING(work_id) LEFT JOIN audit_dossier.revision_links v USING(work_id)
      LEFT JOIN audit_rework.review_routes r USING(work_id) LEFT JOIN audit_rework.review_acknowledgements a USING(work_id)
      WHERE a.job_id IS NULL AND (r.work_id IS NOT NULL OR w.record->>'action'='clarify_reviewer' OR v.work_id IS NOT NULL)
      ORDER BY c.claimed_at,c.work_id`)
        ).rows,
    );
  }

  async acknowledge(delivery: ReviewDelivery, jobId: string) {
    const copy = structuredClone(delivery),
      workId = copy.rework?.workId;
    if (!workId || !jobId) throw new Error("review_delivery_conflict");
    await withAuditTransaction(this.pool, async (client) => {
      await assertQueueDelivery(client, copy);
      await client.query(
        "INSERT INTO audit_rework.review_acknowledgements(work_id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [workId, jobId],
      );
      const row = await client.query<{ job_id: string }>(
        "SELECT job_id FROM audit_rework.review_acknowledgements WHERE work_id=$1",
        [workId],
      );
      if (row.rows[0]?.job_id !== jobId)
        throw new Error("review_delivery_conflict");
    });
  }
}
