/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/reviewAttemptBasis.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Закрепляет критерии и политику до первого чтения ревьюера и сверяет их при продолжении.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { PoolClient } from "pg";
import type { ReviewAttempt, ReviewBasis } from "./ReviewConclusion.types";
import { assertAcceptanceBasis } from "./reviewAcceptanceBasis.repository";

async function readBoundBasis(
  client: PoolClient,
  attempt: ReviewAttempt,
): Promise<ReviewBasis> {
  const result = await client.query<{
    job_id: string;
    reviewer_id: string;
    delivery: ReviewAttempt["delivery"];
    basis: ReviewBasis;
  }>(
    "SELECT job_id,reviewer_id,delivery,basis FROM audit_conclusions.attempt_bases WHERE review_attempt_id=$1",
    [attempt.reviewAttemptId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("review_basis_unbound");
  if (
    row.job_id !== attempt.jobId ||
    row.reviewer_id !== attempt.actorId ||
    !equal(row.delivery, attempt.delivery)
  )
    throw new Error("review_attempt_mismatch");
  return row.basis;
}

/** Конфигурация и выдача основания сериализуются блокировками актуального плана в текущей транзакции. */
export async function bindReviewAttemptBasis(
  client: PoolClient,
  attempt: ReviewAttempt,
): Promise<ReviewBasis> {
  const current = await assertAcceptanceBasis(client, attempt.delivery);
  await client.query(
    `INSERT INTO audit_conclusions.attempt_bases(review_attempt_id,job_id,reviewer_id,audit_result_id,delivery,basis)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(review_attempt_id) DO NOTHING`,
    [
      attempt.reviewAttemptId,
      attempt.jobId,
      attempt.actorId,
      attempt.delivery.resultId,
      attempt.delivery,
      current,
    ],
  );
  const bound = await readBoundBasis(client, attempt);
  if (!equal(bound, current)) throw new Error("review_basis_stale");
  return bound;
}

/** Перед чтением и публикацией исходная запись должна совпасть с живым основанием и предъявленной версией. */
export async function requireBoundReviewBasis(
  client: PoolClient,
  attempt: ReviewAttempt,
  expected?: ReviewBasis,
): Promise<ReviewBasis> {
  const bound = await readBoundBasis(client, attempt);
  if (expected && !equal(bound, expected))
    throw new Error("review_basis_stale");
  return assertAcceptanceBasis(client, attempt.delivery, bound);
}
