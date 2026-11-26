/**
 * @file .ai/tools/worker-assignment/test/conclusion/reviewConclusion.test.ts
 * @version 1.1.4
 * @date 2026-11-26
 * @description Проверяет на временной PostgreSQL публикацию, доставку, единственность решения и получателей доработки.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
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
  type PublishedConclusion,
  type ReviewDecisionCommand,
} from "@realize/payload-task-manager/audit-review";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { resolveClaimedReview } from "../../src/review-queue/resolveClaimedReview.adapter";
import { openAssignmentTestPool } from "../checkpoints/checkpointStorage.fixture";
import { reviewFixture, sha } from "./reviewConclusion.fixture";
import { registerDecisionAccessTests } from "./decisionAccess.test";
import { registerDossierViewTests } from "./taskAuditDossierView.test";
import { registerRollbackTests } from "./conclusionRollback.test";
import { registerEvidenceTests } from "./reviewEvidence.test";
import { registerConclusionAccessTests } from "./conclusionAccess.test";

const execute = promisify(execFile);
function runChild(file: string, ...args: string[]) {
  return execute(
    process.execPath,
    [
      "--import=tsx/esm",
      fileURLToPath(new URL(file, import.meta.url)),
      ...args,
    ],
    { timeout: 45000 },
  );
}
before(async () => {
  await runChild("../publication/initializeReviewDatabase.fixture.mjs");
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
  } finally {
    await pool.end();
  }
});

function accept(c: PublishedConclusion): ReviewDecisionCommand {
  return {
    action: "accept_audit",
    expectedConclusionSha256: c.sha256,
    expectedBasisRevision: c.basis.revision,
    reason: "Выводы и границы подтверждены по четырём критериям.",
  };
}

test("После SIGKILL у издателя новый процесс доставляет ровно одно заключение. Приёмка не закрывает задачу.", async (t) => {
  const f = await reviewFixture(t);
  const publish = () =>
    f.conclusions.publish(f.reviewerId, f.reviewAttemptId, f.basis, f.body);
  await assert.rejects(
    runChild(
      "./conclusionProcess.fixture.ts",
      "publish-crash",
      JSON.stringify({
        actor: f.reviewerId,
        attempt: f.reviewAttemptId,
        basis: f.basis,
        body: f.body,
      }),
    ),
    (e: unknown) =>
      e instanceof Error && "signal" in e && e.signal === "SIGKILL",
  );
  assert.deepEqual(await f.acceptance.inbox(f.orchestratorId), []);
  const entries = await f.conclusions.listForTask(f.task.taskId, f.reviewerId);
  assert.equal(entries.length, 1);
  const [saved] = entries;
  assert.deepEqual(await publish(), saved);
  await assert.rejects(
    f.conclusions.publish(f.reviewerId, f.reviewAttemptId, f.basis, {
      ...f.body,
      summary: "Иная версия.",
    }),
    /review_conclusion_conflict/,
  );
  const dispatch = await runChild("./conclusionProcess.fixture.ts", "dispatch");
  assert(
    JSON.parse(dispatch.stdout).some(
      (row: { conclusionId: string; status: string }) =>
        row.conclusionId === saved.conclusionId && row.status === "delivered",
    ),
  );
  await f.acceptance.dispatchPending();
  assert.deepEqual(await f.acceptance.inbox(f.orchestratorId), [saved]);
  const command = accept(saved);
  const results = await Promise.allSettled(
    [command, { ...command, reason: "Конкурирующее решение." }].map((c) =>
      f.acceptance.decide(f.orchestratorId, saved.conclusionId, c),
    ),
  );
  const winners = results.filter((r) => r.status === "fulfilled");
  assert.equal(winners.length, 1);
  const losing = results.find((r) => r.status === "rejected");
  assert.match(String(losing?.reason), /decision_conflict/);
  const decision = winners[0].value;
  assert.equal(decision.action, "accept_audit");
  assert.equal(decision.workId, null);
  assert.deepEqual(
    await f.acceptance.decide(f.orchestratorId, saved.conclusionId, {
      ...command,
      reason: decision.reason,
    }),
    decision,
  );
  assert.deepEqual(
    await f.acceptance.readDecision(f.orchestratorId, saved.conclusionId),
    decision,
  );
  const state = await f.pool.query(
    "SELECT record->>'status' AS status FROM public.realize_tasks WHERE task_id=$1",
    [f.task.taskId],
  );
  assert.equal(state.rows[0].status, "review");
});

test("Ревьюер выявляет ошибку в проверке версии файла, оркестратор возвращает пункт аудитору", async (t) => {
  const f = await reviewFixture(t, true);
  const c = await f.conclusions.publish(
    f.reviewerId,
    f.reviewAttemptId,
    f.basis,
    f.body,
  );
  await f.acceptance.dispatchPending();
  await assert.rejects(
    f.acceptance.decide(f.orchestratorId, c.conclusionId, accept(c)),
  );
  const item = c.body.assessments.find((a) => a.status === "discrepancy")!;
  const cmd: ReviewDecisionCommand = {
    ...accept(c),
    action: "return_audit",
    reason: item.reason,
    points: [
      {
        criterion: item.criterion,
        correction: item.correction!,
        acceptanceTest: item.acceptanceTest!,
      },
    ],
  };
  const [a, b] = await Promise.all(
    [1, 2].map(() =>
      f.acceptance.decide(f.orchestratorId, c.conclusionId, cmd),
    ),
  );
  assert.deepEqual(a, b);
  assert(a.workId);
  const work = await f.acceptance.readWork(f.plan.auditorId, a.workId);
  assert.equal(work.assigneeId, f.plan.auditorId);
  assert.equal(work.assignmentId, f.task.taskAssignmentId);
  assert.equal(work.nextIteration, 2);
  assert.deepEqual(work.points, cmd.points);
  assert.deepEqual(
    await f.dossier.readResult(c.delivery.resultId, f.plan.auditorId),
    await f.publish(),
  );
});
test("Уточнение направляется независимому ревьюеру по его назначению", async (t) => {
  const f = await reviewFixture(t);
  const c = await f.conclusions.publish(
    f.reviewerId,
    f.reviewAttemptId,
    f.basis,
    f.body,
  );
  await f.acceptance.dispatchPending();
  const d = await f.acceptance.decide(f.orchestratorId, c.conclusionId, {
    ...accept(c),
    action: "clarify_reviewer",
    reason: "Уточнить достаточность статического покрытия.",
    points: [
      {
        criterion: "findings-and-limits",
        correction: "Уточнить ограничение статической проверки.",
        acceptanceTest: "Сверить указанные в заключении диапазоны с картой покрытия.",
      },
    ],
  });
  assert(d.workId);
  const work = await f.acceptance.readWork(f.reviewerId, d.workId);
  assert.equal(work.assigneeId, f.reviewerId);
  assert.equal(work.assignmentId, f.delivery.target.assignmentId);
  await assert.rejects(
    f.acceptance.readWork(f.plan.implementationAuthorId, d.workId),
  );
});

test("Ревизия критериев и точная версия результата проверяются перед публикацией, доставкой и решением", async (t) => {
  const f = await reviewFixture(t);
  const publish = (basis: typeof f.basis) =>
    f.conclusions.publish(f.reviewerId, f.reviewAttemptId, basis, f.body);
  await assert.rejects(
    publish({ ...f.basis, resultId: f.task.taskId }),
    /review_basis_stale/,
  );
  const c = await publish(f.basis);
  await f.acceptance.dispatchPending();
  await assert.rejects(
    f.acceptance.decide(f.orchestratorId, c.conclusionId, {
      ...accept(c),
      expectedConclusionSha256: sha("чужая версия"),
    }),
  );
  const revised = await f.acceptance.configure(
    f.ownerId,
    f.delivery,
    { ...f.config, criteriaSha256: sha("изменённые критерии") },
    f.basis.revision,
  );
  await assert.rejects(publish(f.basis), /review_basis_stale/);
  await assert.rejects(publish(revised), /review_basis_stale/);
  await assert.rejects(
    f.conclusions.begin(f.reviewerId, f.reviewAttemptId),
    /review_basis_stale/,
  );
  const ref = f.body.assessments[0].evidence[0];
  await assert.rejects(
    f.evidence.read(
      f.reviewerId,
      f.reviewAttemptId,
      ref.path,
      ref.startLine,
      ref.endLine,
    ),
    /review_basis_stale/,
  );
  assert.deepEqual(await f.acceptance.inbox(f.orchestratorId), []);
  await assert.rejects(
    f.acceptance.decide(f.orchestratorId, c.conclusionId, accept(c)),
    /review_basis_stale/,
  );
  const pending = await reviewFixture(t);
  const p = await pending.conclusions.publish(
    pending.reviewerId,
    pending.reviewAttemptId,
    pending.basis,
    pending.body,
  );
  await pending.acceptance.configure(
    pending.ownerId,
    pending.delivery,
    { ...pending.config, policySha256: sha("новая политика") },
    pending.basis.revision,
  );
  const outcomes = await pending.acceptance.dispatchPending();
  assert(
    outcomes.some(
      (o) => o.conclusionId === p.conclusionId && o.status === "blocked",
    ),
  );
  assert.deepEqual(await pending.acceptance.inbox(pending.orchestratorId), []);
});
registerEvidenceTests();
registerConclusionAccessTests();
registerDecisionAccessTests();
registerDossierViewTests();
registerRollbackTests();
