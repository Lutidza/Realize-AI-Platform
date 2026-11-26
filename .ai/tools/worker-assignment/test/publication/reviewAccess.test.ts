/**
 * @file .ai/tools/worker-assignment/test/publication/reviewAccess.test.ts
 * @version 1.0.15
 * @date 2026-11-26
 * @description Проверяет полномочия участника при публикации, выдаче работы и чтении материалов ревью.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  setReviewAccess,
  withdrawReviewAssignment,
  withAuditTransaction,
} from "@realize/payload-task-manager/audit-review";
import { dispatchPendingReviews } from "../../src/review-queue/dispatchPendingReviews.service";
import { reviewDispatchKey } from "../../src/review-queue/reviewDispatchKey.util";
import { receiveReviewMaterials } from "../../src/review-queue/receiveReviewMaterials.service";
import { auditReviewFixture } from "./auditReview.fixture";
import { sampleCheckpointAudit } from "../checkpoints/sampleCheckpointAudit.fixture";
import {
  sampleAuditReviewParticipants,
  sampleReviewProjectRoles,
} from "./auditReviewParticipants.fixture";
import { runCheckpointAudit } from "./runCheckpointAudit.fixture";

async function assertMaterialsDenied(
  f: Awaited<ReturnType<typeof auditReviewFixture>>,
  resultId: string,
  actorId: string,
) {
  assert.deepEqual(await f.dossier.listTaskResults(f.task.taskId, actorId), []);
  await assert.rejects(
    f.dossier.readResult(resultId, actorId),
    /review_access_denied/,
  );
  await assert.rejects(
    f.dossier.readArtifact(resultId, "report", actorId),
    /review_access_denied/,
  );
  await assert.rejects(
    f.dossier.readArtifact(resultId, "coverage", actorId),
    /review_access_denied/,
  );
  await assert.rejects(
    f.dossier.readSource(resultId, f.simulator.reads[0].path, actorId),
    /review_access_denied/,
  );
}

/** Использует общий кластер сценариев публикации. Каждая фикстура создаёт свой проект, план и отчёт. */
export function registerReviewAccessTests() {
  test("Выдача проверяет участника, точные версии и отзыв доступа до и после claim", async (t) => {
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
        projectTitle: "Доступ к материалам",
        projectDescription: "",
        listTitle: "Отзыв доступа",
        taskTitle: "Проверить отзыв доступа к материалам",
        taskDescription: "",
        status: "review",
        priority: "normal",
        gitBindings: [],
      },
      projectRoles: sampleReviewProjectRoles,
      runAudit: runCheckpointAudit,
    });
    const published = await f.publish();
    const delivery = await f.dossier.prepareDelivery(published.resultId);
    const key = reviewDispatchKey(delivery);
    for (const forged of [
      { ...delivery, resultId: randomUUID() },
      { ...delivery, report: { ...delivery.report, artifactId: randomUUID() } },
      {
        ...delivery,
        coverage: { ...delivery.coverage, sha256: "0".repeat(64) },
      },
    ]) {
      assert.equal(reviewDispatchKey(forged), key);
      await assert.rejects(f.queue.submit(forged), /audit_delivery_conflict/);
    }
    assert.equal(await f.queue.lookup(key), null);
    const job = await f.queue.submit(delivery);
    await assert.rejects(
      f.queue.claim(key, f.plan.auditorId, "reader"),
      /review_access_denied/,
    );
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, false);
    await assert.rejects(
      f.queue.claim(key, f.reviewerId, "reader"),
      /review_access_denied/,
    );
    await assertMaterialsDenied(f, published.resultId, f.reviewerId);
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, true);
    const claim = await f.queue.claim(key, f.reviewerId, "reader");
    assert.equal(claim.jobId, job.jobId);
    assert.equal(claim.replayed, false);
    // Отзыв между чтениями закрывает выдачу всего пакета. Повтор использует исходную попытку.
    await assert.rejects(
      receiveReviewMaterials(
        f.queue,
        {
          async readArtifact(resultId, kind, actorId) {
            const bytes = await f.dossier.readArtifact(resultId, kind, actorId);
            if (kind === "report")
              await setReviewAccess(
                f.pool,
                f.task.executionId,
                f.reviewerId,
                false,
              );
            return bytes;
          },
        },
        key,
        f.reviewerId,
        "reader",
      ),
      /review_access_denied/,
    );
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, true);
    const restored = await receiveReviewMaterials(
      f.queue,
      f.dossier,
      key,
      f.reviewerId,
      "reader",
    );
    assert.equal(restored.job.reviewAttemptId, claim.reviewAttemptId);
    assert.equal(restored.job.replayed, true);
    assert.deepEqual(
      await f.dossier.readResult(published.resultId, f.reviewerId),
      published,
    );
    await setReviewAccess(f.pool, f.task.executionId, f.reviewerId, false);
    await assert.rejects(
      f.queue.claim(key, f.reviewerId, "reader"),
      /review_access_denied/,
    );
    await assertMaterialsDenied(f, published.resultId, f.reviewerId);
    assert.deepEqual(
      await f.dossier.readResult(published.resultId, f.plan.auditorId),
      published,
    );
  });

  test("Снятое назначение останавливает ожидающую работу, досье сохраняет результат аудитору", async (t) => {
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
        projectTitle: "Назначения на ревью",
        projectDescription: "",
        listTitle: "Снятые назначения",
        taskTitle: "Остановить доставку после снятия назначения",
        taskDescription: "",
        status: "review",
        priority: "normal",
        gitBindings: [],
      },
      projectRoles: sampleReviewProjectRoles,
      runAudit: runCheckpointAudit,
    });
    const { resultId } = await f.publish();
    const delivery = await f.dossier.prepareDelivery(resultId);
    await f.queue.submit(delivery);
    await withdrawReviewAssignment(
      f.pool,
      f.task.executionId,
      f.plan.review.assignmentId,
    );
    await assert.rejects(
      f.dossier.prepareDelivery(resultId),
      /review_assignment_unavailable/,
    );
    await assert.rejects(
      f.queue.claim(reviewDispatchKey(delivery), f.reviewerId, "reader"),
      /review_assignment_unavailable/,
    );
    await assertMaterialsDenied(f, resultId, f.reviewerId);
    assert.equal(
      (await f.dossier.readResult(resultId, f.plan.auditorId)).resultId,
      resultId,
    );
  });

  test("Сохранённый grant теряет силу после удаления участника из проекта Foundation", async (t) => {
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
        projectTitle: "Участники проекта",
        projectDescription: "",
        listTitle: "Проверка членства",
        taskTitle: "Проверить права выбывшего участника",
        taskDescription: "",
        status: "review",
        priority: "normal",
        gitBindings: [],
      },
      projectRoles: sampleReviewProjectRoles,
      runAudit: runCheckpointAudit,
    });
    const { resultId } = await f.publish();
    const delivery = await f.dossier.prepareDelivery(resultId);
    await f.queue.submit(delivery);
    await withAuditTransaction(f.pool, async (client) => {
      const removed = await client.query(
        `UPDATE public.realize_task_projects SET record=jsonb_set(record,'{memberIds}',(record->'memberIds') - $2::text)
          WHERE project_id=$1 AND (record->'memberIds') ? $2::text`,
        [f.task.projectId, f.reviewerId],
      );
      assert.equal(removed.rowCount, 1);
      const grant = await client.query(
        "SELECT allowed FROM audit_review.read_grants WHERE execution_id=$1 AND plan_revision=$2 AND actor_id=$3",
        [f.task.executionId, f.task.planRevision, f.reviewerId],
      );
      assert.equal(grant.rows[0]?.allowed, true);
    });
    await assert.rejects(
      f.dossier.prepareDelivery(resultId),
      /review_access_denied/,
    );
    await assert.rejects(
      f.queue.claim(reviewDispatchKey(delivery), f.reviewerId, "reader"),
      /review_access_denied/,
    );
    await assertMaterialsDenied(f, resultId, f.reviewerId);
    assert.equal(
      (await f.dossier.readResult(resultId, f.plan.auditorId)).resultId,
      resultId,
    );
  });

  test("Блокировка саморевью сохраняет ход независимой задачи и изоляцию материалов", async (t) => {
    const self = await auditReviewFixture(t, {
      audit: sampleCheckpointAudit(),
      participants: sampleAuditReviewParticipants(),
      assignedReviewerRole: "implementationAuthor",
      review: {
        stageId: "report-review",
        assignmentId: randomUUID(),
        assignmentRevision: 1,
        iteration: 1,
      },
      foundation: {
        createdAt: "2026-11-25T12:00:00.000Z",
        listId: randomUUID(),
        projectTitle: "Проверка авторства",
        projectDescription: "",
        listTitle: "Ревью собственной работы",
        taskTitle: "Проверить блокировку саморевью",
        taskDescription: "",
        status: "review",
        priority: "normal",
        gitBindings: [],
      },
      projectRoles: {
        ...sampleReviewProjectRoles,
        members: ["auditor", "implementationAuthor", "replacementReviewer"],
      },
      runAudit: runCheckpointAudit,
    });
    const blocked = await self.publish();
    const other = await auditReviewFixture(t, {
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
        projectTitle: "Независимая проверка",
        projectDescription: "",
        listTitle: "Внешнее ревью",
        taskTitle: "Передать материалы независимому ревьюеру",
        taskDescription: "",
        status: "review",
        priority: "normal",
        gitBindings: [],
      },
      projectRoles: sampleReviewProjectRoles,
      runAudit: runCheckpointAudit,
    });
    const ready = await other.publish();
    assert.equal(self.reviewerId, self.plan.implementationAuthorId);
    const outcomes = await dispatchPendingReviews(self.dossier, self.queue);
    const rejected = outcomes.find(
      (outcome) => outcome.resultId === blocked.resultId,
    );
    const delivered = outcomes.find(
      (outcome) => outcome.resultId === ready.resultId,
    );
    assert.deepEqual(rejected, {
      resultId: blocked.resultId,
      status: "blocked",
      reason: "review_independence_required",
    });
    assert(delivered?.status === "queued");
    const pending = await self.dossier.pendingEvents();
    assert(pending.includes(blocked.resultId));
    assert(!pending.includes(ready.resultId));
    await assertMaterialsDenied(self, blocked.resultId, self.reviewerId);
    await assertMaterialsDenied(other, ready.resultId, self.plan.auditorId);
    await assertMaterialsDenied(self, blocked.resultId, other.reviewerId);
    assert.equal(
      (await self.dossier.readResult(blocked.resultId, self.plan.auditorId))
        .resultId,
      blocked.resultId,
    );
    assert.equal(
      (await other.dossier.readResult(ready.resultId, other.reviewerId))
        .resultId,
      ready.resultId,
    );
  });
}
