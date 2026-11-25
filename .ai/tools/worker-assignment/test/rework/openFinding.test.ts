/**
 * @file .ai/tools/worker-assignment/test/rework/openFinding.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет сохранение открытого замечания и третью ревизию отчёта в том же исполнении задачи.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  returnedAudit,
  correctedAttempt,
  nextReviewer,
  command,
} from "./articleRework.fixture";

export function registerOpenFindingTests() {
  test("Незакрытое замечание проходит ещё одну доработку и принимается по третьей версии отчёта", async (t) => {
    const f = await returnedAudit(t);
    await (await correctedAttempt(f)).publish();
    const first = await nextReviewer(f);
    const item = first.body.assessments.find(
      (row) => row.criterion === "verification-chain",
    )!;
    item.status = "discrepancy";
    item.reason =
      "Отчёт упоминает сравнение полей, но пропускает ветку несовпадения в checkSave.";
    item.correction = "Указать сообщение о занятом адресе при несовпадении.";
    item.acceptanceTest =
      "Проверить вызов showError с полем slug при несовпадении.";
    first.body.recommendation = "needs_changes";
    first.body.summary =
      "Уточнена цепочка, остаётся расхождение по результату сравнения.";
    first.body.resolutions![0] = {
      ...first.body.resolutions![0],
      outcome: "still_open",
      explanation: item.reason,
    };
    const c2 = await f.conclusions.publish(
      f.reviewerId,
      first.reviewAttemptId,
      first.basis,
      first.body,
    );
    await f.acceptance.dispatchPending();
    await assert.rejects(
      f.acceptance.decide(
        f.orchestratorId,
        c2.conclusionId,
        command(c2, "accept_audit"),
      ),
      /review_decision_invalid/,
    );
    const d2 = await f.acceptance.decide(
      f.orchestratorId,
      c2.conclusionId,
      command(c2, "return_audit"),
    );
    const [work] = await f.inbox.inbox(f.plan.auditorId);
    assert.equal(work.workId, d2.workId);
    assert.equal(work.expectedRevision, 3);
    const f2 = { ...f, work };
    const line =
      "При несовпадении checkSave показывает ошибку поля slug о занятом адресе.";
    const corrected = await (await correctedAttempt(f2, line)).publish();
    const last = await nextReviewer(f2);
    const checked = last.body.assessments.find(
      (row) => row.criterion === "verification-chain",
    )!;
    checked.reportQuote = line;
    checked.reason =
      "Ветка после matchesSubmittedDocumentArticle вызывает showError с полем slug.";
    last.body.resolutions![0].explanation = checked.reason;
    assert.equal(
      last.context.auditRevision?.parentResultId,
      c2.delivery.resultId,
    );
    assert.equal(last.context.parent.conclusionId, c2.conclusionId);
    const c3 = await f.conclusions.publish(
      f.reviewerId,
      last.reviewAttemptId,
      last.basis,
      last.body,
    );
    assert.equal(c3.delivery.resultRevision, 3);
    assert.deepEqual(c3.delivery.coverage, corrected.coverage);
    await f.acceptance.dispatchPending();
    assert.equal(
      (
        await f.acceptance.decide(
          f.orchestratorId,
          c3.conclusionId,
          command(c3, "accept_audit"),
        )
      ).action,
      "accept_audit",
    );
    t.diagnostic(
      "Пункт verification-chain: still_open → resolved. Отчёт v3, ревью v3.",
    );
  });
}
