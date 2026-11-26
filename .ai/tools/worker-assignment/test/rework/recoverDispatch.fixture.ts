/**
 * @file .ai/tools/worker-assignment/test/rework/recoverDispatch.fixture.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Восстанавливает ожидающую повторную доставку в отдельном процессе по журналу PostgreSQL.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { ReviewIterationRepository } from "@realize/payload-task-manager/audit-review";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { dispatchNextReviews } from "../../src/review-queue/dispatchNextReviews.service";
import { openAssignmentTestPool } from "../checkpoints/checkpointStorage.fixture";
const pool = openAssignmentTestPool();
try {
  console.log(
    JSON.stringify(
      await dispatchNextReviews(
        new ReviewIterationRepository(pool),
        new PostgresReviewQueue(pool),
      ),
    ),
  );
} finally {
  await pool.end();
}
