/**
 * @file .ai/tools/worker-assignment/test/dossier-preview/runArticleDossier.test.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Материализует в постоянной БД задачу Foundation, отчёт, независимое заключение и решение о приёмке.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AuditDossierRepository,
  initializeAuditPlan,
  ReviewEvidenceRepository,
  ReviewConclusionRepository,
  ReviewAcceptanceRepository,
  ReworkInboxRepository,
  AuditReworkRepository,
  ReviewIterationRepository,
  withAuditTransaction,
} from "@realize/payload-task-manager/audit-review";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { resolveClaimedReview } from "../../src/review-queue/resolveClaimedReview.adapter";
import { openPilotPool } from "../checkpoints/checkpointPilot.fixture";
import { reviewFixture } from "../conclusion/reviewConclusion.fixture";

test("Сохраняет принятый аудит формы «Создать статью» в досье новой задачи", async (t) => {
  const socket = fileURLToPath(
    new URL(
      "../../../../../.data/audit-dossier-preview/socket",
      import.meta.url,
    ),
  );
  assert.equal(process.env.PGHOST, socket);
  assert.equal(process.env.PGPORT, "55439");
  assert.equal(process.env.PGUSER, "realize_checkpoint_runner");
  const pool = openPilotPool();
  t.after(() => pool.end());
  await initializeAuditPlan(pool);
  await new AuditDossierRepository(pool).initialize();
  await new PostgresReviewQueue(pool).initialize();
  await new ReviewEvidenceRepository(pool, resolveClaimedReview).initialize();
  await new ReviewConclusionRepository(pool, resolveClaimedReview).initialize();
  await new ReviewAcceptanceRepository(pool).initialize();
  await new ReworkInboxRepository(pool).initialize();
  await new AuditReworkRepository(pool).initialize();
  await new ReviewIterationRepository(pool).initialize();
  const permissions = await readFile(
    new URL("./previewReader.sql", import.meta.url),
    "utf8",
  );
  await withAuditTransaction(pool, async (client) => {
    await client.query(permissions);
  });

  const f = await reviewFixture(t);
  const conclusion = await f.conclusions.publish(
    f.reviewerId,
    f.reviewAttemptId,
    f.basis,
    f.body,
  );
  await f.acceptance.dispatchPending();
  const decision = await f.acceptance.decide(
    f.orchestratorId,
    conclusion.conclusionId,
    {
      action: "accept_audit",
      expectedConclusionSha256: conclusion.sha256,
      expectedBasisRevision: conclusion.basis.revision,
      reason:
        "Выводы и границы аудита формы подтверждены по четырём критериям.",
    },
  );
  assert.equal(decision.taskId, f.task.taskId);
  assert.equal(decision.workId, null);
  assert.deepEqual(
    await f.acceptance.readDecision(f.orchestratorId, conclusion.conclusionId),
    decision,
  );
  assert.equal(
    (await f.conclusions.listForTask(f.task.taskId, f.orchestratorId)).length,
    1,
  );
  assert.equal(
    (await f.dossier.listTaskResults(f.task.taskId, f.plan.auditorId))[0]
      ?.resultId,
    f.delivery.resultId,
  );
});
