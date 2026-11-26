/**
 * @file .ai/tools/worker-assignment/test/conclusion/conclusionAccess.test.ts
 * @version 1.0.3
 * @date 2026-11-26
 * @description Проверяет текущие права на заключение и его сохранность после отзыва доступа участника.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  setReviewAccess,
  withAuditTransaction,
} from "@realize/payload-task-manager/audit-review";
import { createReviewParticipants } from "../publication/foundationTask.fixture";
import { reviewFixture } from "./reviewConclusion.fixture";

/** Один результат проверяется по ID и через досье задачи до и после изменения полномочий. */
export function registerConclusionAccessTests() {
  test("Досье показывает заключение участникам с текущими правами и сохраняет его после отзыва", async (t) => {
    const f = await reviewFixture(t);
    const saved = await f.conclusions.publish(
      f.reviewerId,
      f.reviewAttemptId,
      f.basis,
      f.body,
    );
    const read = (actorId: string) =>
      f.conclusions.read(saved.conclusionId, actorId);
    const list = (actorId: string) =>
      f.conclusions.listForTask(f.task.taskId, actorId);
    const denied = async (actorId: string) => {
      await assert.rejects(read(actorId), /review_access_denied/);
      assert.deepEqual(await list(actorId), []);
    };
    for (const actorId of [f.reviewerId, f.plan.auditorId, f.orchestratorId]) {
      assert.deepEqual(await read(actorId), saved);
      assert.deepEqual(await list(actorId), [saved]);
    }
    // Автор реализации состоит в проекте, посторонний участник зарегистрирован вне проекта.
    const [outsider] = await createReviewParticipants(f.pool, [
      {
        name: "Посторонний участник",
        email: `outsider+${f.attemptId}@example.invalid`,
      },
    ]);
    await denied(f.plan.implementationAuthorId);
    await denied(outsider);
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, false);
    await denied(f.reviewerId);
    assert.deepEqual(await read(f.plan.auditorId), saved);
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, true);
    assert.deepEqual(await list(f.reviewerId), [saved]);

    await withAuditTransaction(f.pool, async (client) => {
      // Разрешения ревьюера и делегация оркестратору сохраняются. Меняется только членство Foundation.
      for (const removed of [f.reviewerId, f.orchestratorId]) {
        const changed = await client.query(
          `UPDATE public.realize_task_projects SET record=jsonb_set(record,'{memberIds}',(record->'memberIds') - $2::text)
           WHERE project_id=$1 AND (record->'memberIds') ? $2::text`,
          [f.task.projectId, removed],
        );
        assert.equal(changed.rowCount, 1);
      }
      const grant = await client.query<{ allowed: boolean }>(
        "SELECT allowed FROM audit_review.read_grants WHERE execution_id=$1 AND plan_revision=$2 AND actor_id=$3",
        [f.task.executionId, f.task.planRevision, f.reviewerId],
      );
      assert.equal(grant.rows[0]?.allowed, true);
    });
    await denied(f.reviewerId);
    await denied(f.orchestratorId);
    assert.deepEqual(await list(f.plan.auditorId), [saved]);
    const audit = await f.dossier.readResult(
      saved.delivery.resultId,
      f.plan.auditorId,
    );
    assert.deepEqual(audit.report, saved.delivery.report);
    assert.deepEqual(audit.coverage, saved.delivery.coverage);
  });
}
