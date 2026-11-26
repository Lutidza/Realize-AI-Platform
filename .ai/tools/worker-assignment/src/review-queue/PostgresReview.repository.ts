/**
 * @file .ai/tools/worker-assignment/src/review-queue/PostgresReview.repository.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Сохраняет одну работу независимого ревью и атомарно выдаёт её разрешённому участнику.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import type { Pool, PoolClient } from "pg";
import {
  assertQueueDelivery,
  assertReviewClaim,
  withAuditTransaction,
  type ReviewDelivery,
} from "@realize/payload-task-manager/audit-review";
import type {
  ReviewJobReceipt,
  ReviewQueueTransport,
} from "./ReviewDispatch.types";
import { reviewDispatchKey } from "./reviewDispatchKey.util";

async function findJob(client: PoolClient, key: string) {
  const { rows } = await client.query<ReviewJobReceipt>(
    'SELECT job_id AS "jobId", delivery FROM audit_review_runtime.jobs WHERE dispatch_key=$1',
    [key],
  );
  const job = rows[0] ?? null;
  if (job && reviewDispatchKey(job.delivery) !== key)
    throw new Error("review_delivery_conflict");
  return job;
}

/** Авторитетная очередь runtime. Публичный вход Task Manager получает только результат доставки. */
export class PostgresReviewQueue implements ReviewQueueTransport {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    const schema = await readFile(
      new URL("./reviewQueueSchema.sql", import.meta.url),
      "utf8",
    );
    await withAuditTransaction(this.pool, async (client) => {
      await client.query(schema);
    });
  }

  /** Поиск после потери ответа также проверяет пригодность сохранённой версии для этого этапа. */
  lookup(key: string): Promise<ReviewJobReceipt | null> {
    return withAuditTransaction(this.pool, async (client) => {
      const job = await findJob(client, key);
      if (job) await assertQueueDelivery(client, job.delivery);
      return job;
    });
  }

  async submit(input: ReviewDelivery): Promise<ReviewJobReceipt> {
    const delivery = structuredClone(input);
    const key = reviewDispatchKey(delivery);
    return withAuditTransaction(this.pool, async (client) => {
      const existing = await findJob(client, key);
      if (existing && !isDeepStrictEqual(existing.delivery, delivery))
        throw new Error("review_delivery_conflict");
      await assertQueueDelivery(client, delivery);
      if (existing) return existing;
      await client.query(
        `INSERT INTO audit_review_runtime.jobs (dispatch_key,job_id,delivery)
         VALUES ($1,$2,$3::jsonb) ON CONFLICT (dispatch_key) DO NOTHING`,
        [key, randomUUID(), delivery],
      );
      const accepted = await findJob(client, key);
      if (!accepted || !isDeepStrictEqual(accepted.delivery, delivery))
        throw new Error("review_delivery_conflict");
      return accepted;
    });
  }

  /** Та же пара участник/consumer восстанавливает квитанцию после потери ответа. */
  async claim(key: string, trustedActorId: string, consumerId: string) {
    if (!trustedActorId.trim() || !consumerId.trim())
      throw new Error("invalid_review_consumer");
    return withAuditTransaction(this.pool, async (client) => {
      const job = await findJob(client, key);
      if (!job) throw new Error("review_job_missing");
      await assertReviewClaim(client, job.delivery, trustedActorId);
      await assertQueueDelivery(client, job.delivery);
      const reviewAttemptId = randomUUID();
      const update = await client.query(
        `UPDATE audit_review_runtime.jobs SET claimed_by=$2, consumer_id=$3,
                review_attempt_id=$4, claimed_at=clock_timestamp()
          WHERE dispatch_key=$1 AND review_attempt_id IS NULL`,
        [key, trustedActorId, consumerId, reviewAttemptId],
      );
      if (update.rowCount === 1)
        return { ...job, reviewAttemptId, replayed: false };
      const replay = await client.query<{ reviewAttemptId: string }>(
        `SELECT review_attempt_id AS "reviewAttemptId" FROM audit_review_runtime.jobs
          WHERE dispatch_key=$1 AND claimed_by=$2 AND consumer_id=$3`,
        [key, trustedActorId, consumerId],
      );
      if (!replay.rows[0]) throw new Error("review_job_already_claimed");
      return {
        ...job,
        reviewAttemptId: replay.rows[0].reviewAttemptId,
        replayed: true,
      };
    });
  }
}
