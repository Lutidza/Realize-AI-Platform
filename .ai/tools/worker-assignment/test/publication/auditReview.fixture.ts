/**
 * @file .ai/tools/worker-assignment/test/publication/auditReview.fixture.ts
 * @version 13.0.2
 * @date 2026-11-26
 * @description Связывает сохранённый план Foundation с реальными закреплёнными файлами и отчётом имитатора.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import type { TestContext } from "node:test";
import { taskCreateSchema } from "@realize/payload-task-manager/contracts";
import {
  AuditDossierRepository,
  saveAuditPlan,
  setReviewAccess,
} from "@realize/payload-task-manager/audit-review";
import { PostgresReviewQueue } from "../../src/review-queue/PostgresReview.repository";
import { publishReceivedAudit } from "../../src/checkpoints/publishReceivedAudit.service";
import { setupCheckpointStorage } from "../checkpoints/checkpointStorage.fixture";
import {
  createReviewParticipants,
  persistFoundationTask,
} from "./foundationTask.fixture";
import type { AuditReviewFixtureOptions } from "./AuditReviewFixture.types";
import { assertFoundationMembership } from "./foundationMembership.validator";

const taskSettingsSchema = taskCreateSchema.pick({
  status: true,
  priority: true,
  gitBindings: true,
});

/** Регистрирует состав сценария. Для проверки конфликта ролей ревью можно поручить автору. */
export async function auditReviewFixture(
  t: TestContext,
  {
    audit,
    participants,
    assignedReviewerRole,
    review,
    foundation,
    projectRoles,
    runAudit,
  }: AuditReviewFixtureOptions,
) {
  const { status, priority, gitBindings } = foundation;
  taskSettingsSchema.parse({ status, priority, gitBindings });
  assertFoundationMembership(projectRoles);
  const f = await setupCheckpointStorage(t, audit);
  const { task, attemptId, pool } = f;
  const [
    auditorId,
    implementationAuthorId,
    independentReviewer,
    replacementReviewer,
  ] = await createReviewParticipants(pool, [
    participants.auditor,
    participants.implementationAuthor,
    participants.independentReviewer,
    participants.replacementReviewer,
  ]);
  const participantIds = {
    auditor: auditorId,
    implementationAuthor: implementationAuthorId,
    independentReviewer,
    replacementReviewer,
  };
  const reviewerId = participantIds[assignedReviewerRole];
  const ownerId = participantIds[projectRoles.owner];
  const createdTask = await persistFoundationTask(pool, task, foundation, {
    ownerId,
    createdBy: participantIds[projectRoles.taskAuthor],
    assigneeId:
      projectRoles.assignee === null
        ? null
        : participantIds[projectRoles.assignee],
    memberIds: Array.from(
      new Set(projectRoles.members),
      (role) => participantIds[role],
    ),
  });
  const plan = {
    task,
    auditAttemptId: attemptId,
    auditorId,
    implementationAuthorId,
    reviewerId,
    review: { ...review, executionId: task.executionId },
    sourcePins: f.lock.files,
    scopePins: f.initial.state.identity.scopePins,
  };
  await saveAuditPlan(pool, plan);
  await setReviewAccess(pool, task.executionId, auditorId, true);
  if (assignedReviewerRole === "independentReviewer")
    await setReviewAccess(pool, task.executionId, reviewerId, true);
  await runAudit(f);
  const dossier = new AuditDossierRepository(pool);
  const queue = new PostgresReviewQueue(pool);
  return {
    ...f,
    createdTask,
    dossier,
    queue,
    plan,
    ownerId,
    participantIds,
    reviewerId,
    replacementReviewer,
    publish: () => publishReceivedAudit(f.store, dossier, attemptId, f.policy),
  };
}
