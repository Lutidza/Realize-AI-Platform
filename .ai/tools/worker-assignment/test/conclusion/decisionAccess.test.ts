/**
 * @file .ai/tools/worker-assignment/test/conclusion/decisionAccess.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет отзыв прав перед записью решения и видимость ожидающих и исторических заключений.
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  withAuditTransaction,
  type ReviewDecisionCommand,
} from "@realize/payload-task-manager/audit-review";
import { reviewFixture, sha } from "./reviewConclusion.fixture";

/** Сначала полномочия отзываются у уже получившего уведомление оркестратора. */
export function registerDecisionAccessTests() {
  test("Перед приёмкой повторно проверяется членство, после восстановления разрешён один commit", async (t) => {
    const f = await reviewFixture(t);
    const c = await f.conclusions.publish(
      f.reviewerId,
      f.reviewAttemptId,
      f.basis,
      f.body,
    );
    await f.acceptance.dispatchPending();
    assert.deepEqual(await f.acceptance.inbox(f.orchestratorId), [c]);
    const command: ReviewDecisionCommand = {
      action: "accept_audit",
      reason: "Четыре критерия подтверждены.",
      expectedConclusionSha256: c.sha256,
      expectedBasisRevision: c.basis.revision,
    };
    const member = async (allowed: boolean) =>
      withAuditTransaction(f.pool, async (client) => {
        const change = allowed
          ? "(record->'memberIds') || jsonb_build_array($2::text)"
          : "(record->'memberIds') - $2::text";
        const updated = await client.query(
          `UPDATE public.realize_task_projects SET record=jsonb_set(record,'{memberIds}',${change})
        WHERE project_id=$1 AND ((record->'memberIds') ? $2::text) <> $3`,
          [f.task.projectId, f.orchestratorId, allowed],
        );
        assert.equal(updated.rowCount, 1);
      });
    await member(false);
    assert.deepEqual(await f.acceptance.inbox(f.orchestratorId), []);
    await assert.rejects(
      f.acceptance.decide(f.orchestratorId, c.conclusionId, command),
      /orchestrator_access_denied/,
    );
    const count = await f.pool.query(
      "SELECT count(*)::int AS count FROM audit_acceptance.decisions WHERE conclusion_id=$1",
      [c.conclusionId],
    );
    assert.equal(count.rows[0].count, 0);
    await member(true);
    // Новый заголовок повышает ревизию карточки. Оценённые критерии и версия результата остаются прежними.
    await withAuditTransaction(f.pool, async (client) => {
      const updated = await client.query(
        `UPDATE public.realize_tasks SET revision=revision+1,
          record=record || jsonb_build_object('title','Проверить форму статьи','revision',revision+1)
          WHERE task_id=$1 AND revision=$2`,
        [f.task.taskId, f.task.taskRevision],
      );
      assert.equal(updated.rowCount, 1);
    });
    const saved = await f.acceptance.decide(
      f.orchestratorId,
      c.conclusionId,
      command,
    );
    assert.equal(saved.taskRevisionAtDecision, f.task.taskRevision + 1);
    assert.deepEqual(
      await f.acceptance.readDecision(f.orchestratorId, c.conclusionId),
      saved,
    );
    await f.acceptance.configure(
      f.plan.auditorId,
      f.delivery,
      { ...f.config, policySha256: sha("Новая действующая политика") },
      f.basis.revision,
    );
    assert.deepEqual(
      await f.acceptance.readDecision(f.orchestratorId, c.conclusionId),
      saved,
    );
    await member(false);
    await assert.rejects(
      f.acceptance.readDecision(f.orchestratorId, c.conclusionId),
      /orchestrator_access_denied/,
    );
  });

  test("Смена основания после доставки скрывает незавершённое решение из входящих", async (t) => {
    const f = await reviewFixture(t);
    const c = await f.conclusions.publish(
      f.reviewerId,
      f.reviewAttemptId,
      f.basis,
      f.body,
    );
    await f.acceptance.dispatchPending();
    assert.deepEqual(await f.acceptance.inbox(f.orchestratorId), [c]);
    await f.acceptance.configure(
      f.plan.auditorId,
      f.delivery,
      { ...f.config, criteriaSha256: sha("Изменившиеся критерии") },
      f.basis.revision,
    );
    assert.deepEqual(await f.acceptance.inbox(f.orchestratorId), []);
    await assert.rejects(
      f.acceptance.decide(f.orchestratorId, c.conclusionId, {
        action: "accept_audit",
        reason: "Принять прежнюю версию.",
        expectedConclusionSha256: c.sha256,
        expectedBasisRevision: c.basis.revision,
      }),
      /review_basis_stale/,
    );
  });
}
