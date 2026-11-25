/**
 * @file .ai/tools/worker-assignment/test/publication/reviewProcess.fixture.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Прерывает издателя или диспетчер после настоящего commit и получает работу отдельным процессом.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import { AuditDossierRepository } from "@realize/payload-task-manager/audit-review";
import { createRepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { PostgresCheckpointStore } from "../../src/checkpoints/PostgresCheckpoint.repository";
import { publishReceivedAudit } from "../../src/checkpoints/publishReceivedAudit.service";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { dispatchPendingReviews } from "../../src/review-queue/dispatchPendingReviews.service";
import { openPilotPool } from "../checkpoints/checkpointPilot.fixture";
import { receiveReviewMaterials } from "../../src/review-queue/receiveReviewMaterials.service";
import { createHash } from "node:crypto";

const [action, ...args] = process.argv.slice(2);
const pool = openPilotPool();
const dossier = new AuditDossierRepository(pool);
const queue = new PostgresReviewQueue(pool);
try {
  if (action === "publish-crash") {
    const [attemptId, root] = args;
    await publishReceivedAudit(
      new PostgresCheckpointStore(pool),
      dossier,
      attemptId,
      await createRepositoryReadPolicy(root, true),
    );
    process.kill(process.pid, "SIGKILL");
  } else if (action === "submit-crash") {
    await dispatchPendingReviews(dossier, {
      lookup: (key) => queue.lookup(key),
      async submit(delivery) {
        const accepted = await queue.submit(delivery);
        process.kill(process.pid, "SIGKILL");
        return accepted;
      },
    });
  } else if (action === "dispatch" || action === "reconcile") {
    const transport =
      action === "dispatch"
        ? queue
        : {
            lookup: (key: string) => queue.lookup(key),
            submit: async () => {
              throw new Error("unexpected_resubmit");
            },
          };
    const outcome = await dispatchPendingReviews(dossier, transport);
    console.log(JSON.stringify(outcome));
  } else if (action === "claim") {
    const [key, actor, consumer] = args;
    try {
      const { job, report, coverage } = await receiveReviewMaterials(
        queue,
        dossier,
        key,
        actor,
        consumer,
      );
      console.log(
        JSON.stringify({
          ...job,
          consumer,
          pid: process.pid,
          readHashes: [report, coverage].map((bytes) =>
            createHash("sha256").update(bytes).digest("hex"),
          ),
        }),
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "review_job_already_claimed"
      )
        throw error;
      console.log(
        JSON.stringify({ error: error.message, consumer, pid: process.pid }),
      );
    }
  } else throw new Error("invalid_review_test_action");
} finally {
  await pool.end();
}
