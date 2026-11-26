/**
 * @file .ai/tools/worker-assignment/test/publication/auditPublication.test.ts
 * @version 1.0.17
 * @date 2026-11-26
 * @description Проверяет публикацию, восстановление очереди и сохранность материалов после потери среды аудитора.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { before, test } from "node:test";
import {
  AuditDossierRepository,
  initializeAuditPlan,
  saveAuditPlan,
  setReviewAccess,
  withAuditTransaction,
} from "@realize/payload-task-manager/audit-review";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { reviewDispatchKey } from "../../src/review-queue/reviewDispatchKey.util";
import { publishReceivedAudit } from "../../src/checkpoints/publishReceivedAudit.service";
import { prepareAuditHandoff } from "../../src/checkpoints/prepareAuditHandoff.service";
import { openAssignmentTestPool } from "../checkpoints/checkpointStorage.fixture";
import { auditReviewFixture } from "./auditReview.fixture";
import { sampleCheckpointAudit } from "../checkpoints/sampleCheckpointAudit.fixture";
import {
  sampleAuditReviewParticipants,
  sampleReviewProjectRoles,
} from "./auditReviewParticipants.fixture";
import { runCheckpointAudit } from "./runCheckpointAudit.fixture";
import { registerReviewAccessTests } from "./reviewAccess.test";

const execute = promisify(execFile);
const digest = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
function child(...args: string[]) {
  return execute(
    process.execPath,
    [
      "--import=tsx/esm",
      fileURLToPath(new URL("./reviewProcess.fixture.ts", import.meta.url)),
      ...args,
    ],
    { timeout: 30000 },
  );
}
const killed = (e: unknown) =>
  e instanceof Error && "signal" in e && e.signal === "SIGKILL";

before(async () => {
  await execute(process.execPath, [
    "--import=tsx/esm",
    fileURLToPath(
      new URL("./initializeReviewDatabase.fixture.mjs", import.meta.url),
    ),
  ]);
  const pool = openAssignmentTestPool();
  try {
    await initializeAuditPlan(pool);
    await new AuditDossierRepository(pool).initialize();
    await new PostgresReviewQueue(pool).initialize();
  } finally {
    await pool.end();
  }
});

test("Сбой после публикации и потеря ответа очереди: прежняя работа доставлена независимому ревьюеру", async (t) => {
  const readPath = "src/module/entry.ts";
  const unreadPath = "src/shared/value.ts";
  const f = await auditReviewFixture(t, {
    audit: sampleCheckpointAudit(
      { [readPath]: "// прочитано\n", [unreadPath]: "// вне плана чтений\n" },
      [{ path: readPath, startLine: 1, lineCount: 1 }],
    ),
    participants: sampleAuditReviewParticipants(),
    assignedReviewerRole: "independentReviewer",
    review: {
      stageId: "report-review",
      assignmentId: randomUUID(),
      assignmentRevision: 1,
      iteration: 1,
    },
    foundation: {
      createdAt: "2026-11-25T12:00:00.000Z",
      listId: randomUUID(),
      projectTitle: "Доставка отчётов",
      projectDescription: "Передача отчётов независимым ревьюерам.",
      listTitle: "Повторная доставка",
      taskTitle: "Доставить отчёт после сбоя очереди",
      taskDescription:
        "Проверить повторную доставку после потери ответа очереди.",
      status: "review",
      priority: "normal",
      gitBindings: [],
    },
    projectRoles: sampleReviewProjectRoles,
    runAudit: runCheckpointAudit,
  });
  const expected = prepareAuditHandoff(
    await f.store.get(f.attemptId),
    await f.store.receipts(f.attemptId),
    f.result.context,
  );
  await assert.rejects(child("publish-crash", f.attemptId, f.root), killed);
  const entries = await f.dossier.listTaskResults(f.task.taskId, f.reviewerId);
  assert.equal(entries.length, 1);
  const [published] = entries;
  assert.equal(published.handoffSha256, expected.handoffSha256);
  assert.equal(published.attemptId, f.attemptId);
  assert.deepEqual(published.task, f.task);
  assert.deepEqual(await f.dossier.pendingEvents(), [published.resultId]);
  const repeats = await Promise.all([f.publish(), f.publish()]);
  assert(repeats.every((item) => item.resultId === published.resultId));
  const target = await f.dossier.prepareDelivery(published.resultId);
  assert.deepEqual(target.target, f.plan.review);
  const key = reviewDispatchKey(target);
  assert.equal(await f.queue.lookup(key), null);

  // Здесь прекращается существование исходного хранилища попытки в изолированной БД теста.
  await rm(f.root, { recursive: true });
  await withAuditTransaction(f.pool, (client) =>
    client.query("DROP SCHEMA audit_checkpoint CASCADE"),
  );
  const report = await f.dossier.readArtifact(
    published.resultId,
    "report",
    f.reviewerId,
  );
  const coverage = await f.dossier.readArtifact(
    published.resultId,
    "coverage",
    f.reviewerId,
  );
  assert.equal(report.toString("utf8"), expected.report);
  assert.equal(digest(report), published.report.sha256);
  assert.equal(digest(coverage), published.coverage.sha256);
  assert.deepEqual(JSON.parse(coverage.toString()), expected.coverage);
  assert.deepEqual(
    expected.coverage
      .filter((row) => row.status === "unread")
      .map((row) => row.path),
    [unreadPath],
  );
  for (const [path, sha] of Object.entries(f.lock.files))
    assert.equal(
      digest(
        await f.dossier.readSource(published.resultId, path, f.reviewerId),
      ),
      sha,
    );

  await assert.rejects(child("submit-crash"), killed);
  assert.deepEqual(await f.dossier.pendingEvents(), [published.resultId]);
  const accepted = await f.queue.lookup(key);
  assert(accepted);
  const outcomes = JSON.parse((await child("reconcile")).stdout);
  assert.deepEqual(outcomes, [
    { resultId: published.resultId, status: "queued", jobId: accepted.jobId },
  ]);
  assert.deepEqual(await f.dossier.pendingEvents(), []);
  assert.deepEqual(JSON.parse((await child("dispatch")).stdout), []);
  const claims = await Promise.all(
    ["worker-A", "worker-B"].map(async (consumer) =>
      JSON.parse((await child("claim", key, f.reviewerId, consumer)).stdout),
    ),
  );
  assert.equal(new Set(claims.map((c) => c.pid)).size, 2);
  assert.equal(
    claims.filter((c) => c.error === "review_job_already_claimed").length,
    1,
  );
  const winner = claims.find((c) => c.jobId === accepted.jobId);
  assert(winner && !winner.replayed && winner.reviewAttemptId !== f.attemptId);
  assert.deepEqual(winner.readHashes, [
    published.report.sha256,
    published.coverage.sha256,
  ]);
  const replay = await f.queue.claim(key, f.reviewerId, winner.consumer);
  assert.equal(replay.reviewAttemptId, winner.reviewAttemptId);
  assert.equal(replay.replayed, true);
  const totals = await f.pool.query(
    `SELECT
    (SELECT count(*)::int FROM audit_review.assignments WHERE execution_id=$1) AS assignments,
    (SELECT count(*)::int FROM audit_dossier.artifacts WHERE result_id=$2) AS artifacts,
    (SELECT count(*)::int FROM audit_dossier.sources WHERE result_id=$2) AS sources,
    (SELECT count(*)::int FROM audit_dossier.results WHERE task_id=$3) AS results,
    (SELECT count(*)::int FROM audit_dossier.published_events WHERE result_id=$2) AS events,
    (SELECT count(*)::int FROM audit_review_runtime.jobs WHERE dispatch_key=$4 AND review_attempt_id IS NOT NULL) AS claims`,
    [f.task.executionId, published.resultId, f.task.taskId, key],
  );
  assert.deepEqual(totals.rows[0], {
    assignments: 2,
    artifacts: 2,
    sources: Object.keys(f.lock.files).length,
    results: 1,
    events: 1,
    claims: 1,
  });
});

test("Откат публикации до commit, две параллельные публикации и конфликт нового содержимого", async (t) => {
  const f = await auditReviewFixture(t, {
    audit: sampleCheckpointAudit(),
    participants: sampleAuditReviewParticipants(),
    assignedReviewerRole: "independentReviewer",
    review: {
      stageId: "report-review",
      assignmentId: randomUUID(),
      assignmentRevision: 1,
      iteration: 1,
    },
    foundation: {
      createdAt: "2026-11-25T12:00:00.000Z",
      listId: randomUUID(),
      projectTitle: "Публикация отчётов",
      projectDescription: "",
      listTitle: "Параллельные публикации",
      taskTitle: "Проверить повторную публикацию отчёта",
      taskDescription: "",
      status: "in_progress",
      priority: "high",
      gitBindings: [],
    },
    projectRoles: sampleReviewProjectRoles,
    runAudit: runCheckpointAudit,
  });
  // Ошибка на последней вставке должна откатить и материалы, и manifest.
  await withAuditTransaction(f.pool, (client) =>
    client.query(`CREATE FUNCTION audit_dossier.fail_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'test_publish_interrupted'; END $$;
    CREATE TRIGGER fail_fixture BEFORE INSERT ON audit_dossier.published_events FOR EACH ROW EXECUTE FUNCTION audit_dossier.fail_fixture()`),
  );
  try {
    await assert.rejects(f.publish(), /test_publish_interrupted/);
    assert.deepEqual(
      await f.dossier.listTaskResults(f.task.taskId, f.reviewerId),
      [],
    );
  } finally {
    await withAuditTransaction(f.pool, (client) =>
      client.query(
        "DROP TRIGGER fail_fixture ON audit_dossier.published_events; DROP FUNCTION audit_dossier.fail_fixture()",
      ),
    );
  }
  const [a, b] = await Promise.all([f.publish(), f.publish()]);
  assert.deepEqual(a, b);
  const handoff = prepareAuditHandoff(
    await f.store.get(f.attemptId),
    await f.store.receipts(f.attemptId),
    f.result.context,
  );
  const { handoffSha256: originalHash, ...manifest } = handoff;
  const report = "Исправленная версия требует отдельной итерации";
  const different = { ...manifest, report, reportSha256: digest(report) };
  assert.notEqual(originalHash, digest(JSON.stringify(different)));
  await assert.rejects(
    publishReceivedAudit(
      f.store,
      {
        publish: (input) =>
          f.dossier.publish({
            ...different,
            sources: input.sources,
            handoffSha256: digest(JSON.stringify(different)),
          }),
      },
      f.attemptId,
      f.policy,
    ),
    /audit_publication_conflict/,
  );
  assert.deepEqual(
    await f.dossier.listTaskResults(f.task.taskId, f.reviewerId),
    [a],
  );
  const envelope = await f.dossier.prepareDelivery(a.resultId);
  const job = await f.queue.submit(envelope);
  await f.dossier.acknowledge(envelope, job.jobId);
});

registerReviewAccessTests();

test("Поздний отчёт исходной попытки сохраняется в досье и не назначается заменившему ревьюеру", async (t) => {
  const f = await auditReviewFixture(t, {
    audit: sampleCheckpointAudit(),
    participants: sampleAuditReviewParticipants(),
    assignedReviewerRole: "independentReviewer",
    review: {
      stageId: "report-review",
      assignmentId: randomUUID(),
      assignmentRevision: 1,
      iteration: 1,
    },
    foundation: {
      createdAt: "2026-11-25T12:00:00.000Z",
      listId: randomUUID(),
      projectTitle: "Назначение ревьюеров",
      projectDescription: "",
      listTitle: "Запоздавшие отчёты",
      taskTitle: "Проверить доставку отчёта после смены ревьюера",
      taskDescription: "",
      status: "review",
      priority: "normal",
      gitBindings: [],
    },
    projectRoles: sampleReviewProjectRoles,
    runAudit: runCheckpointAudit,
  });
  const revised = {
    ...f.plan,
    task: { ...f.task, planRevision: f.task.planRevision + 1 },
    auditAttemptId: randomUUID(),
    reviewerId: f.replacementReviewer,
    review: { ...f.plan.review, assignmentId: randomUUID(), iteration: 2 },
  };
  await saveAuditPlan(f.pool, revised);
  await setReviewAccess(
    f.pool,
    f.task.executionId,
    f.replacementReviewer,
    true,
  );
  const published = await f.publish();
  assert.deepEqual(published.task, f.task);
  assert.deepEqual(
    await f.dossier.listTaskResults(f.task.taskId, f.plan.auditorId),
    [published],
  );
  await assert.rejects(
    f.dossier.prepareDelivery(published.resultId),
    /review_assignment_unavailable/,
  );
  for (const id of [f.reviewerId, f.replacementReviewer])
    await assert.rejects(
      f.dossier.readArtifact(published.resultId, "report", id),
      /review_access_denied/,
    );
  assert((await f.dossier.pendingEvents()).includes(published.resultId));
  assert.equal(
    await f.queue.lookup(
      reviewDispatchKey({ ...published, target: revised.review }),
    ),
    null,
  );
});
