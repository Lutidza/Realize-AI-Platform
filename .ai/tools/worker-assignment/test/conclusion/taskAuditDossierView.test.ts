/**
 * @file .ai/tools/worker-assignment/test/conclusion/taskAuditDossierView.test.ts
 * @version 1.0.3
 * @date 2026-11-26
 * @description Проверяет выдачу трёх согласованных материалов, связь с задачей, отзыв доступа и несовпадение хеша.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import {
  readTaskAuditDossier,
  type ReviewDecisionCommand,
} from "@realize/payload-task-manager/audit-review";
import { reviewFixture, sha } from "./reviewConclusion.fixture";

async function deliveredConclusion(t: TestContext) {
  const fixture = await reviewFixture(t);
  const conclusion = await fixture.conclusions.publish(
    fixture.reviewerId,
    fixture.reviewAttemptId,
    fixture.basis,
    fixture.body,
  );
  await fixture.acceptance.dispatchPending();
  const command: ReviewDecisionCommand = {
    action: "accept_audit",
    reason: "Аудит подтверждён.",
    expectedConclusionSha256: conclusion.sha256,
    expectedBasisRevision: conclusion.basis.revision,
  };
  return { fixture, conclusion, command };
}

export function registerDossierViewTests() {
  test("В карточке видны три точные версии своего решения до отзыва членства", async (t) => {
    const { fixture: f, conclusion: c, command } = await deliveredConclusion(t);
    const d = await f.acceptance.decide(
      f.orchestratorId,
      c.conclusionId,
      command,
    );
    const read = (
      actorId: string,
      taskId = f.task.taskId,
      decisionId = d.decisionId,
    ) => readTaskAuditDossier(f.pool, actorId, taskId, decisionId);
    const view = await read(f.orchestratorId);
    assert(view);
    assert.equal(view.taskId, f.task.taskId);
    assert.equal(view.taskKey, f.createdTask.key);
    assert.equal(view.taskTitle, f.createdTask.title);
    assert.equal(view.report.resultId, c.delivery.resultId);
    assert.equal(view.report.auditorId, f.plan.auditorId);
    assert.equal(view.report.revision, c.delivery.report.revision);
    assert.equal(sha(view.report.text), c.delivery.report.sha256);
    assert.equal(view.conclusion.reviewerId, f.reviewerId);
    assert.equal(view.conclusion.sha256, d.conclusionSha256);
    assert.equal(view.decision.decisionId, d.decisionId);
    assert.equal(view.decision.actorId, f.orchestratorId);
    assert.equal(view.conclusion.assessments.length, c.body.assessments.length);
    assert.doesNotMatch(
      JSON.stringify(view),
      /"(sources|receiptId|evidence|policySha256)"\s*:/,
    );
    assert.equal(await read(f.plan.auditorId), null);
    assert.equal(await read(f.reviewerId), null);
    assert.equal(await read(f.plan.implementationAuthorId), null);
    assert.equal(await read(f.orchestratorId, randomUUID()), null);
    assert.equal(
      await read(f.orchestratorId, f.task.taskId, randomUUID()),
      null,
    );
    assert.equal(await read(f.orchestratorId, f.task.taskId, "не-uuid"), null);
    await f.pool.query(
      "UPDATE public.realize_task_projects SET record=jsonb_set(record,'{memberIds}',(record->'memberIds') - $2::text) WHERE project_id=$1",
      [f.task.projectId, f.orchestratorId],
    );
    assert.equal(await read(f.orchestratorId), null);
  });

  test("Несовпадение хеша решения с закреплённым заключением скрывает все материалы", async (t) => {
    const { fixture: f, conclusion: c } = await deliveredConclusion(t);
    const decisionId = randomUUID();
    // Имитируем унаследованную несогласованную запись до фиксации решения этой тестовой задачи.
    const inconsistent = {
      decisionId,
      actorId: f.orchestratorId,
      taskId: f.task.taskId,
      conclusionId: c.conclusionId,
      conclusionRevision: c.revision,
      conclusionSha256: sha("иной текст"),
      basis: c.basis,
      action: "accept_audit",
      reason: "Проверка повреждённой связи.",
      points: [],
      taskRevisionAtDecision: 1,
      workId: null,
      createdAt: new Date().toISOString(),
    };
    await f.pool.query(
      "INSERT INTO audit_acceptance.decisions(conclusion_id,decision_id,manifest) VALUES($1,$2,$3)",
      [c.conclusionId, decisionId, inconsistent],
    );
    await assert.rejects(
      readTaskAuditDossier(f.pool, f.orchestratorId, f.task.taskId, decisionId),
      /audit_dossier_inconsistent/,
    );
  });
}
