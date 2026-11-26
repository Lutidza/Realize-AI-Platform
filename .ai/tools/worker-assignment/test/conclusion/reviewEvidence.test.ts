/**
 * @file .ai/tools/worker-assignment/test/conclusion/reviewEvidence.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет принадлежность независимых чтений и отказ в публикации недоказанных оценок.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setReviewAccess } from "@realize/payload-task-manager/audit-review";
import { sampleCheckpointAudit } from "../checkpoints/sampleCheckpointAudit.fixture";
import { reviewFixture } from "./reviewConclusion.fixture";

export function registerEvidenceTests() {
  test("Подмена цитаты, версии, собственной квитанции или границ чтения блокирует публикацию заключения", async (t) => {
    const f = await reviewFixture(t);
    const other = await reviewFixture(t);
    assert.notEqual(other.reviewAttemptId, f.reviewAttemptId);
    const publish = (body: typeof f.body) =>
      f.conclusions.publish(f.reviewerId, f.reviewAttemptId, f.basis, body);
    const anchor = structuredClone(f.body);
    anchor.assessments[0].reportQuote =
      "Неподтверждённая фраза " + randomUUID();
    await assert.rejects(publish(anchor), /review_anchor_mismatch/);
    const expected = f.body.assessments[0].evidence[0];
    const otherReceipt = other.body.assessments[0].evidence[0];
    for (const forged of [
      { ...expected, receiptId: randomUUID() },
      { ...expected, receiptId: otherReceipt.receiptId },
      { ...expected, path: expected.path + ".other" },
      {
        ...expected,
        sha256:
          expected.sha256 === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64),
      },
      { ...expected, endLine: expected.endLine + 1 },
      {
        ...expected,
        auditorCoverage:
          expected.auditorCoverage === "covered"
            ? ("partial" as const)
            : ("covered" as const),
      },
    ]) {
      const candidate = structuredClone(f.body);
      candidate.assessments[0].evidence[0] = forged;
      await assert.rejects(publish(candidate), /review_evidence_mismatch/);
    }
    const duplicate = structuredClone(f.body);
    duplicate.assessments[1].criterion = duplicate.assessments[0].criterion;
    await assert.rejects(publish(duplicate), /review_conclusion_invalid/);
    const missingCorrection = structuredClone(f.body);
    missingCorrection.assessments[0].status = "discrepancy";
    missingCorrection.recommendation = "needs_changes";
    delete missingCorrection.assessments[0].correction;
    await assert.rejects(
      publish(missingCorrection),
      /review_conclusion_invalid/,
    );
    assert.deepEqual(
      await f.conclusions.listForTask(f.task.taskId, f.reviewerId),
      [],
    );
    const stored = await f.pool.query(
      "SELECT result_id FROM audit_conclusions.results WHERE review_attempt_id=$1",
      [f.reviewAttemptId],
    );
    assert.equal(stored.rowCount, 0);
  });

  test("Собственное чтение ревьюера не расширяет покрытие аудитора, а отзыв доступа закрывает чтение и публикацию", async (t) => {
    const path = "src/module/entry.ts";
    const audit = sampleCheckpointAudit(
      { [path]: "// начало\nexport const entry = 1;\n// конец\n" },
      [{ path, startLine: 2, lineCount: 1 }],
    );
    const f = await reviewFixture(t, false, audit);
    const outsideAuditMap = Object.keys(f.plan.sourcePins).find(
      (path) => !Object.hasOwn(f.plan.scopePins, path),
    );
    assert(outsideAuditMap);
    const before = await f.dossier.readArtifact(
      f.delivery.resultId,
      "coverage",
      f.reviewerId,
    );
    const read = (actorId: string, attemptId: string) =>
      f.evidence.read(actorId, attemptId, outsideAuditMap, 1, 1);
    await assert.rejects(
      read(f.plan.auditorId, f.reviewAttemptId),
      /review_attempt_unavailable/,
    );
    await assert.rejects(
      read(f.reviewerId, f.attemptId),
      /review_attempt_unavailable/,
    );
    const covered = f.body.assessments[0].evidence[0];
    assert(covered.startLine > 1);
    const overlap = await f.evidence.read(
      f.reviewerId,
      f.reviewAttemptId,
      covered.path,
      covered.startLine - 1,
      covered.startLine,
    );
    assert.equal(overlap.auditorCoverage, "partial");
    const source = await f.dossier.readSource(
      f.delivery.resultId,
      covered.path,
      f.reviewerId,
    );
    const lines = source.toString("utf8").match(/[^\n]*\n|[^\n]+$/g)!;
    const tail = await f.evidence.read(
      f.reviewerId,
      f.reviewAttemptId,
      covered.path,
      lines.length,
      lines.length + 20,
    );
    assert.deepEqual([tail.endLine, tail.text], [lines.length, lines.at(-1)]);
    const { text, ...ref } = await read(f.reviewerId, f.reviewAttemptId);
    assert(text.length > 0);
    assert.deepEqual(
      [ref.path, ref.sha256, ref.startLine, ref.endLine, ref.auditorCoverage],
      [outsideAuditMap, f.plan.sourcePins[outsideAuditMap], 1, 1, "unread"],
    );
    const proof = await f.pool.query(
      "SELECT actor_id,review_attempt_id,result_id FROM audit_review_evidence.reads WHERE receipt_id=$1",
      [ref.receiptId],
    );
    assert.deepEqual(proof.rows, [
      {
        actor_id: f.reviewerId,
        review_attempt_id: f.reviewAttemptId,
        result_id: f.delivery.resultId,
      },
    ]);
    const copy = structuredClone(f.body);
    const row = copy.assessments[0];
    row.status = "confirmed";
    row.evidence = [ref];
    delete row.correction;
    delete row.acceptanceTest;
    copy.recommendation = copy.assessments.some(
      (r) => r.status === "discrepancy",
    )
      ? "needs_changes"
      : "confirmed";
    await assert.rejects(
      f.conclusions.publish(f.reviewerId, f.reviewAttemptId, f.basis, copy),
      /review_evidence_mismatch/,
    );
    assert.deepEqual(
      await f.dossier.readArtifact(
        f.delivery.resultId,
        "coverage",
        f.reviewerId,
      ),
      before,
    );
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, false);
    await assert.rejects(
      read(f.reviewerId, f.reviewAttemptId),
      /review_access_denied/,
    );
    await assert.rejects(
      f.conclusions.publish(f.reviewerId, f.reviewAttemptId, f.basis, f.body),
      /review_access_denied/,
    );
    assert.deepEqual(
      await f.conclusions.listForTask(f.task.taskId, f.plan.auditorId),
      [],
    );
  });
}
