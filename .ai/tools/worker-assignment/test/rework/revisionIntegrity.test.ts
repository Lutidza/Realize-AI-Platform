/**
 * @file .ai/tools/worker-assignment/test/rework/revisionIntegrity.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет целостность версий отчёта, ответов по замечаниям и атомарность повторной публикации.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  setReviewAccess,
  withAuditTransaction,
} from "@realize/payload-task-manager/audit-review";
import { correctedAttempt, returnedAudit } from "./auditRework.fixture";
import { dispatchNextReviews } from "../../src/review-queue/dispatchNextReviews.service";

/** Первым сценарием одноразового кластера проверяет upgrade схемы с реально опубликованным отчётом V1. */
export function registerLegacyDossierUpgradeTest() {
  test("Повторный initialize досье сохраняет V1 со старой схемой и разрешает публикацию V2", async (t) => {
    const f = await returnedAudit(t);
    const { resultId } = f.initialConclusion.delivery;
    const original = await f.dossier.readResult(resultId, f.plan.auditorId);
    const report = await f.dossier.readArtifact(
      resultId,
      "report",
      f.plan.auditorId,
    );
    const coverage = await f.dossier.readArtifact(
      resultId,
      "coverage",
      f.plan.auditorId,
    );
    await withAuditTransaction(f.pool, async (client) => {
      const later =
        await client.query(`SELECT 1 FROM audit_dossier.artifacts WHERE revision<>1
        UNION ALL SELECT 1 FROM audit_dossier.published_events WHERE lane<>'initial' LIMIT 1`);
      assert.equal(
        later.rowCount,
        0,
        "Старую форму можно воспроизводить только до появления V2",
      );
      await client.query(`ALTER TABLE audit_dossier.artifacts
        DROP CONSTRAINT artifacts_pkey, DROP CONSTRAINT artifacts_revision_check,
        ADD PRIMARY KEY (artifact_id), ADD CONSTRAINT artifacts_revision_check CHECK (revision=1);
        ALTER TABLE audit_dossier.published_events DROP COLUMN lane`);
    });
    // Оба запуска проходят тем же путём, что и штатная инициализация следующего процесса.
    await f.dossier.initialize();
    await f.dossier.initialize();
    assert.deepEqual(
      await f.dossier.readResult(resultId, f.plan.auditorId),
      original,
    );
    for (const [kind, expected] of [
      ["report", report],
      ["coverage", coverage],
    ] as const) {
      const actual = await f.dossier.readArtifact(resultId, kind, f.reviewerId);
      assert.deepEqual(actual, expected);
      assert.equal(
        createHash("sha256").update(actual).digest("hex"),
        original[kind].sha256,
      );
    }
    const event = await f.pool.query<{ lane: string }>(
      "SELECT lane FROM audit_dossier.published_events WHERE result_id=$1",
      [resultId],
    );
    assert.deepEqual(event.rows, [{ lane: "initial" }]);
    const corrected = await correctedAttempt(f);
    const next = await corrected.publish();
    assert.equal(next.resultRevision, 2);
    assert.equal(next.report.artifactId, original.report.artifactId);
    assert.equal(next.coverage.artifactId, original.coverage.artifactId);
    await dispatchNextReviews(f.iterations, f.queue);
  });
}

export function registerRevisionIntegrityTests() {
  test("Два издателя создают одну новую ревизию, родитель и ответы доступны по текущим правам", async (t) => {
    const f = await returnedAudit(t);
    const fixed = await correctedAttempt(f);
    const [published, replay] = await Promise.all([
      fixed.publish(),
      fixed.publish(),
    ]);
    assert.deepEqual(replay, published);
    const source = f.initialConclusion.delivery;
    assert.notEqual(published.resultId, source.resultId);
    assert.equal(published.resultRevision, source.resultRevision + 1);
    assert.equal(published.attemptId, fixed.attemptId);
    for (const kind of ["report", "coverage"] as const) {
      assert.equal(published[kind].artifactId, source[kind].artifactId);
      assert.equal(published[kind].revision, source[kind].revision + 1);
      assert.notEqual(published[kind].sha256, source[kind].sha256);
      assert(
        !(
          await f.dossier.readArtifact(source.resultId, kind, f.reviewerId)
        ).equals(
          await f.dossier.readArtifact(published.resultId, kind, f.reviewerId),
        ),
      );
    }
    const link = await f.revisions.readLink(published.resultId, f.reviewerId);
    assert(link);
    assert.equal(link.workId, f.work.workId);
    assert.equal(link.parentResultId, source.resultId);
    assert.equal(link.parentRevision, source.resultRevision);
    assert.equal(link.parentConclusionSha256, f.initialConclusion.sha256);
    assert.deepEqual(link.responses, fixed.responses);
    assert.equal(
      await f.revisions.readLink(source.resultId, f.reviewerId),
      null,
    );
    assert(!(await f.dossier.pendingEvents()).includes(published.resultId));
    const events = await f.pool.query<{ lane: string }>(
      "SELECT lane FROM audit_dossier.published_events WHERE result_id=$1",
      [published.resultId],
    );
    assert.deepEqual(events.rows, [{ lane: "rework" }]);
    await assert.rejects(
      fixed.publish(
        fixed.responses.map((r) => ({
          ...r,
          response: r.response + " Дополнение.",
        })),
      ),
      /audit_revision_conflict/,
    );
    assert.deepEqual(
      await f.revisions.readLink(published.resultId, f.plan.auditorId),
      link,
    );
    await assert.rejects(
      f.revisions.readLink(published.resultId, f.plan.implementationAuthorId),
      /review_access_denied/,
    );
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, false);
    await assert.rejects(
      f.revisions.readLink(published.resultId, f.reviewerId),
      /review_access_denied/,
    );
    assert.deepEqual(
      await f.revisions.readLink(published.resultId, f.plan.auditorId),
      link,
    );
  });

  test("Ответы покрывают возвращённые критерии, а сбой записи родословной откатывает весь результат", async (t) => {
    const f = await returnedAudit(t);
    const fixed = await correctedAttempt(f);
    await assert.rejects(fixed.publish([]), /audit_revision_responses_invalid/);
    await assert.rejects(
      fixed.publish(
        fixed.responses.map((r) => ({
          ...r,
          reportQuote: "Цитата вне исправленного отчёта.",
        })),
      ),
      /audit_revision_responses_invalid/,
    );
    const [point] = fixed.responses;
    assert(point);
    await assert.rejects(
      fixed.publish([...fixed.responses, point]),
      /audit_revision_responses_invalid/,
    );
    await withAuditTransaction(f.pool, async (client) => {
      await client.query(`CREATE FUNCTION audit_dossier.fail_revision_fixture() RETURNS trigger LANGUAGE plpgsql AS $body$
        BEGIN RAISE EXCEPTION 'test_revision_interrupted'; END $body$;
        CREATE TRIGGER fail_revision_fixture BEFORE INSERT ON audit_dossier.revision_links
        FOR EACH ROW EXECUTE FUNCTION audit_dossier.fail_revision_fixture()`);
    });
    try {
      await assert.rejects(fixed.publish(), /test_revision_interrupted/);
      const results = await f.dossier.listTaskResults(
        f.task.taskId,
        f.plan.auditorId,
      );
      assert.deepEqual(
        results.map((r) => r.resultId),
        [f.initialConclusion.delivery.resultId],
      );
      const partial = await f.pool.query(
        `SELECT 1 FROM audit_dossier.results WHERE attempt_id=$1
         UNION ALL SELECT 1 FROM audit_dossier.revision_links WHERE work_id=$2
         UNION ALL SELECT 1 FROM audit_rework.completed WHERE work_id=$2`,
        [fixed.attemptId, f.work.workId],
      );
      assert.equal(partial.rowCount, 0);
      assert(
        (await f.inbox.inbox(f.plan.auditorId)).some(
          (w) => w.workId === f.work.workId,
        ),
      );
    } finally {
      await withAuditTransaction(f.pool, async (client) => {
        await client.query(
          "DROP TRIGGER fail_revision_fixture ON audit_dossier.revision_links; DROP FUNCTION audit_dossier.fail_revision_fixture()",
        );
      });
    }
    assert.equal(
      (await fixed.publish()).resultRevision,
      f.work.expectedRevision,
    );
    assert(
      !(await f.inbox.inbox(f.plan.auditorId)).some(
        (w) => w.workId === f.work.workId,
      ),
    );
  });
}
