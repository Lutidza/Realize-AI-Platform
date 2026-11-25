/**
 * @file .ai/tools/worker-assignment/test/rework/recoverDispatch.fixture.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Восстанавливает ожидающую повторную доставку в отдельном процессе по журналу PostgreSQL.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import { ReviewIterationRepository } from "@realize/payload-task-manager/audit-review";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { dispatchNextReviews } from "../../src/review-queue/dispatchNextReviews.service";
import { openPilotPool } from "../checkpoints/checkpointPilot.fixture";
const pool = openPilotPool();
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
