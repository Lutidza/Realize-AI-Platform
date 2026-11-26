/**
 * @file .ai/tools/worker-assignment/test/conclusion/conclusionRollback.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Имитирует отказы второй записи транзакций публикации и адресной доработки в отдельной PostgreSQL.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { withAuditTransaction } from "@realize/payload-task-manager/audit-review";
import { reviewFixture } from "./reviewConclusion.fixture";

/** Триггер действует только во временной БД последовательного теста и снимается при любом исходе. */
async function failInsert(
  pool: Pool,
  relation: "audit_conclusions.published_events" | "audit_acceptance.work",
  action: () => Promise<unknown>,
) {
  await withAuditTransaction(pool, (client) =>
    client.query(
      `CREATE TRIGGER test_fail_insert BEFORE INSERT ON ${relation} FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite()`,
    ),
  );
  try {
    await assert.rejects(action(), /audit_dossier_immutable/);
  } finally {
    await withAuditTransaction(pool, (client) =>
      client.query(`DROP TRIGGER test_fail_insert ON ${relation}`),
    );
  }
}

export function registerRollbackTests() {
  test("Ошибка записи события или поручения откатывает всю операцию и допускает повтор", async (t) => {
    const f = await reviewFixture(t, true);
    const publish = () =>
      f.conclusions.publish(f.reviewerId, f.reviewAttemptId, f.basis, f.body);
    await failInsert(f.pool, "audit_conclusions.published_events", publish);
    assert.deepEqual(
      await f.conclusions.listForTask(f.task.taskId, f.reviewerId),
      [],
    );
    const conclusion = await publish();
    await f.acceptance.dispatchPending();
    const issue = conclusion.body.assessments.find(
      (a) => a.status === "discrepancy",
    )!;
    const decide = () =>
      f.acceptance.decide(f.orchestratorId, conclusion.conclusionId, {
        action: "return_audit",
        reason: issue.reason,
        expectedConclusionSha256: conclusion.sha256,
        expectedBasisRevision: conclusion.basis.revision,
        points: [
          {
            criterion: issue.criterion,
            correction: issue.correction!,
            acceptanceTest: issue.acceptanceTest!,
          },
        ],
      });
    await failInsert(f.pool, "audit_acceptance.work", decide);
    await assert.rejects(
      f.acceptance.readDecision(f.orchestratorId, conclusion.conclusionId),
      /review_decision_unavailable/,
    );
    assert.deepEqual(await f.acceptance.inbox(f.orchestratorId), [conclusion]);
    const saved = await decide();
    assert(saved.workId);
    assert.equal(
      (await f.acceptance.readWork(f.plan.auditorId, saved.workId)).decisionId,
      saved.decisionId,
    );
  });
}
