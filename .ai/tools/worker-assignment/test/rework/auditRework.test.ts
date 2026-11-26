/**
 * @file .ai/tools/worker-assignment/test/rework/auditRework.test.ts
 * @version 1.0.3
 * @date 2026-11-26
 * @description Проверяет полный цикл повторных аудитов и уточнений на одноразовой PostgreSQL.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { before, test } from "node:test";
import {
  AuditDossierRepository,
  initializeAuditPlan,
  ReviewEvidenceRepository,
  ReviewConclusionRepository,
  ReviewAcceptanceRepository,
  ReworkInboxRepository,
  AuditReworkRepository,
  ReviewIterationRepository,
  setReviewAccess,
} from "@realize/payload-task-manager/audit-review";
import { resolveClaimedReview } from "../../src/review-queue/resolveClaimedReview.adapter";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { openAssignmentTestPool } from "../checkpoints/checkpointStorage.fixture";
import {
  returnedAudit,
  correctedAttempt,
  nextReviewer,
  command,
} from "./auditRework.fixture";
import { startReworkAudit } from "../../src/checkpoints/startReworkAudit.service";
import { advanceAuditCheckpoint } from "../../src/checkpoints/advanceAuditCheckpoint.service";
import { registerOpenFindingTests } from "./openFinding.test";
import { registerIterationDispatchTests } from "./iterationDispatch.test";
import {
  registerLegacyDossierUpgradeTest,
  registerRevisionIntegrityTests,
} from "./revisionIntegrity.test";
import { registerRepeatEvidenceTests } from "./repeatEvidence.test";
const execute = promisify(execFile);

before(async () => {
  await execute(process.execPath, [
    "--import=tsx/esm",
    fileURLToPath(
      new URL(
        "../publication/initializeReviewDatabase.fixture.mjs",
        import.meta.url,
      ),
    ),
  ]);
  const pool = openAssignmentTestPool();
  try {
    await initializeAuditPlan(pool);
    await new AuditDossierRepository(pool).initialize();
    await new PostgresReviewQueue(pool).initialize();
    await new ReviewEvidenceRepository(pool, resolveClaimedReview).initialize();
    await new ReviewConclusionRepository(
      pool,
      resolveClaimedReview,
    ).initialize();
    await new ReviewAcceptanceRepository(pool).initialize();
    await new ReworkInboxRepository(pool).initialize();
    await new AuditReworkRepository(pool).initialize();
    await new ReviewIterationRepository(pool).initialize();
  } finally {
    await pool.end();
  }
});

registerLegacyDossierUpgradeTest();

test("Возврат → исправленный отчёт → повторное ревью → уточнение → приёмка аудита", async (t) => {
  const f = await returnedAudit(t);
  const corrected = await correctedAttempt(f);
  const revision = await corrected.publish();
  assert.equal(revision.resultRevision, 2);
  assert.notEqual(revision.resultId, f.delivery.resultId);
  assert.equal(revision.report.artifactId, f.delivery.report.artifactId);
  assert.notEqual(revision.report.sha256, f.delivery.report.sha256);
  const v2 = await nextReviewer(f);
  assert.equal(v2.context.auditRevision?.workId, f.work.workId);
  assert.deepEqual(v2.context.auditRevision?.responses, corrected.responses);
  assert.equal(v2.delivery.target.iteration, 2);
  assert.equal(v2.delivery.resultId, revision.resultId);
  const second = await f.conclusions.publish(
    f.reviewerId,
    v2.reviewAttemptId,
    v2.basis,
    v2.body,
  );
  assert.equal(second.revision, 2);
  await f.acceptance.dispatchPending();
  const clarify = await f.acceptance.decide(
    f.orchestratorId,
    second.conclusionId,
    command(second, "clarify_reviewer"),
  );
  assert(clarify.workId);
  const [work] = await f.inbox.inbox(f.reviewerId);
  assert.equal(work.workId, clarify.workId);
  await f.inbox.claim(f.reviewerId, work.workId);
  const v3 = await nextReviewer({ ...f, work });
  assert.deepEqual(v3.delivery.report, v2.delivery.report);
  assert.deepEqual(v3.delivery.coverage, v2.delivery.coverage);
  assert.notEqual(v2.reviewAttemptId, v3.reviewAttemptId);
  assert.equal(v3.context.parent.conclusionId, second.conclusionId);
  const third = await f.conclusions.publish(
    f.reviewerId,
    v3.reviewAttemptId,
    v3.basis,
    v3.body,
  );
  assert.equal(third.revision, 3);
  await f.acceptance.dispatchPending();
  const result = await f.acceptance.decide(
    f.orchestratorId,
    third.conclusionId,
    command(third, "accept_audit"),
  );
  assert.equal(result.conclusionRevision, 3);
  assert.equal(result.workId, null);
  assert.deepEqual(await f.inbox.inbox(f.plan.auditorId), []);
  assert.deepEqual(await f.inbox.inbox(f.reviewerId), []);
  assert.equal(
    (await f.conclusions.listForTask(f.task.taskId, f.reviewerId)).length,
    3,
  );
  assert.equal(
    (await f.dossier.listTaskResults(f.task.taskId, f.plan.auditorId)).length,
    2,
  );
  assert.deepEqual(
    await f.acceptance
      .readDecision(f.orchestratorId, f.initialConclusion.conclusionId)
      .then((d) => d.action),
    "return_audit",
  );
  t.diagnostic(
    "Отчёт v1 → v2; заключение v1 → v2 → v3; итог accept_audit. Задача " +
      f.task.taskId,
  );
});

test("Уточнение исходного заключения сохраняет отчёт v1 и доставляется после перезапуска", async (t) => {
  const f = await returnedAudit(t, true);
  const claims = await Promise.all(
    [1, 2].map(() => f.inbox.claim(f.reviewerId, f.work.workId)),
  );
  assert.equal(claims[0].attemptId, claims[1].attemptId);
  const recovery = await execute(process.execPath, [
    "--import=tsx/esm",
    fileURLToPath(new URL("./recoverDispatch.fixture.ts", import.meta.url)),
  ]);
  assert(
    JSON.parse(recovery.stdout).some(
      (row: { workId: string; status: string }) =>
        row.workId === f.work.workId && row.status === "queued",
    ),
  );
  const next = await nextReviewer(f);
  const c = await f.conclusions.publish(
    f.reviewerId,
    next.reviewAttemptId,
    next.basis,
    next.body,
  );
  assert.equal(c.revision, 2);
  assert.equal(c.delivery.resultRevision, 1);
  assert.deepEqual(c.delivery.report, f.delivery.report);
  assert.deepEqual(c.delivery.coverage, f.delivery.coverage);
  assert.equal(next.context.auditRevision, null);
  await f.acceptance.dispatchPending();
  assert.equal(
    (
      await f.acceptance.decide(
        f.orchestratorId,
        c.conclusionId,
        command(c, "accept_audit"),
      )
    ).action,
    "accept_audit",
  );
  t.diagnostic("Отчёт v1; заключение v1 → v2; итог accept_audit.");
});

test("Чужой участник и отозванный grant не получают поручение или прежний контекст аудитора", async (t) => {
  const f = await returnedAudit(t);
  await assert.rejects(
    f.inbox.claim(f.reviewerId, f.work.workId),
    /rework_access_denied/,
  );
  const actor = f.plan.auditorId;
  const { attemptId } = await f.inbox.claim(actor, f.work.workId);
  await setReviewAccess(f.pool, f.task.executionId, actor, false);
  assert.deepEqual(await f.inbox.inbox(actor), []);
  await assert.rejects(
    f.inbox.readAuditInput(actor, f.work.workId, attemptId),
    /review_access_denied/,
  );
  await setReviewAccess(f.pool, f.task.executionId, actor, true);
  assert.equal(
    (await f.inbox.claim(actor, f.work.workId)).attemptId,
    attemptId,
  );
});

test("Отзыв во время доработки блокирует следующую отправку имитатору", async (t) => {
  const f = await returnedAudit(t);
  const actor = f.plan.auditorId;
  const snapshot = await startReworkAudit(
    f.inbox,
    f.store,
    actor,
    f.work.workId,
    f.policy,
    f.initial.state.identity.selection,
  );
  await setReviewAccess(f.pool, f.task.executionId, actor, false);
  const lease = await f.store.claim(
    snapshot.attemptId,
    snapshot.revision,
    "check-revocation",
    30000,
  );
  let sends = 0;
  try {
    const result = await advanceAuditCheckpoint(
      f.store,
      snapshot,
      lease,
      f.task,
      f.policy,
      {
        async send() {
          sends++;
          throw new Error("unexpected_send");
        },
      },
      undefined,
      f.inbox,
    );
    assert.equal(sends, 0);
    assert.equal(result.state.status, "blocked");
    if (result.state.status === "blocked")
      assert.equal(result.state.reason, "review_access_denied");
  } finally {
    await f.store.release(lease);
  }
});

registerOpenFindingTests();
registerIterationDispatchTests();
registerRevisionIntegrityTests();
registerRepeatEvidenceTests();
