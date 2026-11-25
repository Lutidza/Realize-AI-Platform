/**
 * @file .ai/tools/worker-assignment/test/conclusion/conclusionProcess.fixture.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Прерывает процесс после commit заключения либо восстанавливает доставку новым процессом.
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import {
  ReviewConclusionRepository,
  ReviewAcceptanceRepository,
} from "@realize/payload-task-manager/audit-review";
import { resolveClaimedReview } from "../../src/review-queue/resolveClaimedReview.adapter";
import { openPilotPool } from "../checkpoints/checkpointPilot.fixture";

const pool = openPilotPool();
try {
  if (process.argv[2] === "publish-crash") {
    const { actor, attempt, basis, body } = JSON.parse(process.argv[3]);
    await new ReviewConclusionRepository(pool, resolveClaimedReview).publish(
      actor,
      attempt,
      basis,
      body,
    );
    process.kill(process.pid, "SIGKILL");
  } else if (process.argv[2] === "dispatch") {
    console.log(
      JSON.stringify(
        await new ReviewAcceptanceRepository(pool).dispatchPending(),
      ),
    );
  } else throw new Error("unknown_pilot_operation");
} finally {
  await pool.end();
}
