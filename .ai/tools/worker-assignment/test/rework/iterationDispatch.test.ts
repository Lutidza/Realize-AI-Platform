/**
 * @file .ai/tools/worker-assignment/test/rework/iterationDispatch.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет восстановление выдачи повторного ревью, неизменность входа и повторную проверку полномочий.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  setReviewAccess,
  type ReviewDelivery,
} from "@realize/payload-task-manager/audit-review";
import { dispatchNextReviews } from "../../src/review-queue/dispatchNextReviews.service";
import { reviewDispatchKey } from "../../src/review-queue/reviewDispatchKey.util";
import { correctedAttempt, returnedAudit } from "./articleRework.fixture";

export function registerIterationDispatchTests() {
  test("Потеря ответа после приёма уточнения восстанавливается по тому же ключу, старая работа больше не выдаётся", async (t) => {
    const f = await returnedAudit(t, true);
    const { workId } = f.work;
    await f.inbox.claim(f.reviewerId, workId);
    let ownSubmits = 0;
    const transport = {
      lookup: (key: string) => f.queue.lookup(key),
      async submit(delivery: ReviewDelivery) {
        const receipt = await f.queue.submit(delivery);
        if (delivery.rework?.workId === workId && ++ownSubmits === 1)
          throw new Error("lost_after_commit");
        return receipt;
      },
    };
    const first = (await dispatchNextReviews(f.iterations, transport)).find(
      (o) => o.workId === workId,
    );
    assert.equal(first?.status, "delivery_unknown");
    const delivery = await f.iterations.prepareNextReview(f.reviewerId, workId);
    const key = reviewDispatchKey(delivery),
      old = reviewDispatchKey(f.delivery);
    assert.notEqual(key, old);
    const job = await f.queue.lookup(key);
    assert(job);
    const restored = (await dispatchNextReviews(f.iterations, transport)).find(
      (o) => o.workId === workId,
    );
    assert.deepEqual(restored, { workId, status: "queued", jobId: job.jobId });
    assert.equal(ownSubmits, 1);
    const durable = await f.pool.query(
      `SELECT
      (SELECT count(*)::int FROM audit_review_runtime.jobs WHERE dispatch_key=$1) AS jobs,
      (SELECT count(*)::int FROM audit_rework.review_acknowledgements WHERE work_id=$2 AND job_id=$3) AS acks`,
      [key, workId, job.jobId],
    );
    assert.deepEqual(durable.rows[0], { jobs: 1, acks: 1 });
    await assert.rejects(f.queue.lookup(old), /review_assignment_unavailable/);
    await assert.rejects(
      f.queue.claim(old, f.reviewerId, "review-simulator"),
      /review_assignment_unavailable/,
    );
    assert(delivery.rework);
    const forged = {
      ...delivery,
      rework: { ...delivery.rework, parentConclusionSha256: "0".repeat(64) },
    };
    await assert.rejects(f.queue.submit(forged), /review_delivery_conflict/);
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, false);
    await assert.rejects(
      f.queue.claim(key, f.reviewerId, "review-repeat"),
      /review_access_denied/,
    );
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, true);
    const claim = await f.queue.claim(key, f.reviewerId, "review-repeat");
    assert.equal(claim.jobId, job.jobId);
    assert.notEqual(claim.reviewAttemptId, f.reviewAttemptId);
  });

  test("Отзыв права до подготовки исправленного отчёта сохраняет событие и допускает независимое уточнение", async (t) => {
    const blocked = await returnedAudit(t);
    const correction = await correctedAttempt(blocked);
    await correction.publish();
    await setReviewAccess(
      blocked.pool,
      blocked.task.executionId,
      blocked.reviewerId,
      false,
    );
    await assert.rejects(
      blocked.iterations.prepareNextReview(
        blocked.work.assigneeId,
        blocked.work.workId,
      ),
      /review_access_denied/,
    );
    const next = await returnedAudit(t, true);
    await next.inbox.claim(next.reviewerId, next.work.workId);
    const processed = await dispatchNextReviews(
      blocked.iterations,
      blocked.queue,
    );
    assert.deepEqual(
      processed.find((row) => row.workId === blocked.work.workId),
      {
        workId: blocked.work.workId,
        status: "blocked",
        reason: "review_access_denied",
      },
    );
    assert.equal(
      processed.find((row) => row.workId === next.work.workId)?.status,
      "queued",
    );
    const pending = await blocked.iterations.pendingReviews();
    assert(pending.some((row) => row.workId === blocked.work.workId));
    assert(!pending.some((row) => row.workId === next.work.workId));
    await setReviewAccess(
      blocked.pool,
      blocked.task.executionId,
      blocked.reviewerId,
      true,
    );
    const retry = await dispatchNextReviews(blocked.iterations, blocked.queue);
    assert.equal(
      retry.find((row) => row.workId === blocked.work.workId)?.status,
      "queued",
    );
  });
}
