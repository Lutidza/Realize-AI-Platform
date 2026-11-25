/**
 * @file .ai/tools/worker-assignment/test/publication/auditReview.fixture.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Связывает сохранённый план Foundation с реальными закреплёнными файлами и отчётом имитатора.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import {
  AuditDossierRepository,
  saveAuditPlan,
  setReviewAccess,
} from "@realize/payload-task-manager/audit-review";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { publishReceivedAudit } from "../../src/checkpoints/publishReceivedAudit.service";
import {
  setupCheckpointPilot,
  runCheckpointProcess,
} from "../checkpoints/checkpointPilot.fixture";
import {
  createReviewParticipants,
  persistFoundationTask,
} from "./foundationTask.fixture";

export async function auditReviewFixture(
  t: TestContext,
  independent = true,
  runAudit?: (
    fixture: Awaited<ReturnType<typeof setupCheckpointPilot>>,
  ) => Promise<void>,
) {
  const f = await setupCheckpointPilot(t);
  const { task, attemptId, pool } = f;
  const [
    auditorId,
    implementationAuthorId,
    independentReviewer,
    replacementReviewer,
  ] = await createReviewParticipants(pool);
  const reviewerId = independent ? independentReviewer : implementationAuthorId;
  await persistFoundationTask(pool, task, [
    ...new Set([
      auditorId,
      implementationAuthorId,
      reviewerId,
      replacementReviewer,
    ]),
  ]);
  const review = {
    executionId: task.executionId,
    stageId: "frontend-review",
    assignmentId: randomUUID(),
    assignmentRevision: 1,
    iteration: 1,
  };
  const plan = {
    task,
    auditAttemptId: attemptId,
    auditorId,
    implementationAuthorId,
    reviewerId,
    review,
    sourcePins: f.lock.files,
    scopePins: f.initial.state.identity.scopePins,
  };
  await saveAuditPlan(pool, plan);
  await setReviewAccess(pool, task.executionId, auditorId, true);
  if (independent)
    await setReviewAccess(pool, task.executionId, reviewerId, true);
  if (runAudit) await runAudit(f);
  else {
    assert.equal(
      (await runCheckpointProcess(f, "first-read")).status,
      "pending",
    );
    assert.equal((await runCheckpointProcess(f, "step")).status, "received");
  }
  const dossier = new AuditDossierRepository(pool);
  const queue = new PostgresReviewQueue(pool);
  return {
    ...f,
    dossier,
    queue,
    plan,
    reviewerId,
    replacementReviewer,
    publish: () => publishReceivedAudit(f.store, dossier, attemptId, f.policy),
  };
}
