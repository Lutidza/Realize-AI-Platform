/**
 * @file .ai/tools/worker-assignment/test/rework/repeatEvidence.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет связь повторного ответа с исходными пунктами, свежие квитанции и единственность новой ревизии.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReviewBody } from "@realize/payload-task-manager/audit-review";
import {
  correctedAttempt,
  nextReviewer,
  returnedAudit,
} from "./articleRework.fixture";

export function registerRepeatEvidenceTests() {
  test("Повторное ревью принимает только ответы на возвращённые пункты и доказательства текущей попытки", async (t) => {
    const f = await returnedAudit(t);
    const corrected = await correctedAttempt(f);
    await corrected.publish();
    const next = await nextReviewer(f);
    const publish = (body: ReviewBody) =>
      f.conclusions.publish(
        f.reviewerId,
        next.reviewAttemptId,
        next.basis,
        body,
      );
    const absent: ReviewBody = structuredClone(next.body);
    delete absent.resolutions;
    await assert.rejects(publish(absent), /review_resolution_mismatch/);

    const otherCriterion = structuredClone(next.body);
    const changed = otherCriterion.resolutions![0];
    changed.criterion = next.body.assessments.find(
      (row) => row.criterion !== changed.criterion,
    )!.criterion;
    await assert.rejects(publish(otherCriterion), /review_resolution_mismatch/);
    const alteredCheck = structuredClone(next.body);
    alteredCheck.resolutions![0].acceptanceTest += " Другое требование.";
    await assert.rejects(publish(alteredCheck), /review_resolution_mismatch/);
    const contradictory = structuredClone(next.body);
    contradictory.resolutions![0].outcome = "still_open";
    await assert.rejects(publish(contradictory), /review_resolution_mismatch/);
    const stale = structuredClone(next.body);
    stale.assessments[0].evidence[0] =
      f.initialConclusion.body.assessments[0].evidence[0];
    await assert.rejects(publish(stale), /review_evidence_mismatch/);
    const successors = () =>
      f.pool.query(
        "SELECT conclusion_id FROM audit_conclusions.successors WHERE work_id=$1",
        [f.work.workId],
      );
    assert.equal((await successors()).rowCount, 0);

    const accepted = await publish(next.body);
    assert.notEqual(accepted.conclusionId, f.initialConclusion.conclusionId);
    assert.equal(accepted.revision, f.initialConclusion.revision + 1);
    assert.equal(
      accepted.delivery.rework?.parentConclusionSha256,
      f.initialConclusion.sha256,
    );
    assert.equal(
      accepted.delivery.resultRevision,
      f.initialConclusion.delivery.resultRevision + 1,
    );
    assert.deepEqual(await publish(structuredClone(next.body)), accepted);
    const conflict = structuredClone(next.body);
    conflict.resolutions![0].explanation +=
      " Иное обоснование после публикации.";
    await assert.rejects(publish(conflict), /review_conclusion_conflict/);
    assert.deepEqual((await successors()).rows, [
      { conclusion_id: accepted.conclusionId },
    ]);
  });
}
