/**
 * @file .ai/tools/worker-assignment/src/review-queue/resolveClaimedReview.adapter.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Подтверждает личность и происхождение попытки ревью по сохранённому claim в очереди.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import {
  assertQueueDelivery,
  assertReviewClaim,
  type ReviewAttempt,
  type ReviewAttemptAuthority,
} from "@realize/payload-task-manager/audit-review";
import { reviewDispatchKey } from "./reviewDispatchKey.util";

/** Идентичность участника поступает из доверенного вызова. Claim и разрешения удерживаются до commit. */
export const resolveClaimedReview: ReviewAttemptAuthority = async (
  client,
  reviewAttemptId,
  actorId,
) => {
  const { rows } = await client.query<ReviewAttempt & { key: string }>(
    `SELECT dispatch_key AS key, job_id AS "jobId", review_attempt_id AS "reviewAttemptId", claimed_by AS "actorId", delivery
     FROM audit_review_runtime.jobs WHERE review_attempt_id=$1 AND claimed_by=$2 FOR SHARE`,
    [reviewAttemptId, actorId],
  );
  const row = rows[0];
  if (!row) throw new Error("review_attempt_unavailable");
  const { key, ...attempt } = row;
  if (key !== reviewDispatchKey(attempt.delivery))
    throw new Error("review_delivery_conflict");
  await assertReviewClaim(client, attempt.delivery, actorId);
  await assertQueueDelivery(client, attempt.delivery);
  return attempt;
};
