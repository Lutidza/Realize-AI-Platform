/**
 * @file .ai/tools/worker-assignment/test/rework/articleRework.fixture.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проводит поручение от входящих адресата до нового отчёта, независимых чтений и выводов по замечаниям.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import {
  AuditReworkRepository,
  ReworkInboxRepository,
  ReviewIterationRepository,
  ReviewReworkContextRepository,
  type AuditRevisionResponse,
  type PublishedConclusion,
  type AuditRework,
  type ReviewDecisionCommand,
} from "@realize/payload-task-manager/audit-review";
import { startReworkAudit } from "../../src/checkpoints/startReworkAudit.service";
import { publishReworkedAudit } from "../../src/checkpoints/publishReworkedAudit.service";
import { dispatchNextReviews } from "../../src/review-queue/dispatchNextReviews.service";
import { receiveReviewMaterials } from "../../src/review-queue/receiveReviewMaterials.service";
import { reviewDispatchKey } from "../../src/review-queue/reviewDispatchKey.util";
import { resolveClaimedReview } from "../../src/review-queue/resolveClaimedReview.adapter";
import {
  auditQuotes,
  runArticleAudit,
} from "../conclusion/articleAuditReport.fixture";
import {
  reviewFixture,
  buildReviewBody,
} from "../conclusion/reviewConclusion.fixture";

type ParentFixture = Awaited<ReturnType<typeof reviewFixture>>;

export function command(
  c: PublishedConclusion,
  action: ReviewDecisionCommand["action"],
): ReviewDecisionCommand {
  const issue = c.body.assessments.find((a) => a.status === "discrepancy");
  const points =
    action === "clarify_reviewer"
      ? [
          {
            criterion: "findings-and-limits" as const,
            correction:
              "Уточнить, чем проверка по коду отличается от проверки записи.",
            acceptanceTest:
              "Указать пределы статических выводов на конкретном обработчике записи.",
          },
        ]
      : action === "return_audit" && issue
        ? [
            {
              criterion: issue.criterion,
              correction: issue.correction!,
              acceptanceTest: issue.acceptanceTest!,
            },
          ]
        : [];
  return {
    action,
    reason:
      action === "accept_audit"
        ? "Все пункты проверены по новому заключению."
        : "Требуется повторная проверка перечисленных пунктов.",
    expectedConclusionSha256: c.sha256,
    expectedBasisRevision: c.basis.revision,
    points,
  };
}

export async function returnedAudit(t: TestContext, clarify = false) {
  const f = await reviewFixture(t, !clarify);
  const initialConclusion = await f.conclusions.publish(
    f.reviewerId,
    f.reviewAttemptId,
    f.basis,
    f.body,
  );
  await f.acceptance.dispatchPending();
  const decision = await f.acceptance.decide(
    f.orchestratorId,
    initialConclusion.conclusionId,
    command(initialConclusion, clarify ? "clarify_reviewer" : "return_audit"),
  );
  assert(decision.workId);
  const inbox = new ReworkInboxRepository(f.pool);
  const work = await f.acceptance.readWork(
    clarify ? f.reviewerId : f.plan.auditorId,
    decision.workId,
  );
  assert.deepEqual(await inbox.inbox(work.assigneeId), [work]);
  return {
    ...f,
    inbox,
    work,
    initialConclusion,
    revisions: new AuditReworkRepository(f.pool),
    iterations: new ReviewIterationRepository(f.pool),
  };
}

export async function correctedAttempt(
  f: Awaited<ReturnType<typeof returnedAudit>>,
  extraReportLine?: string,
) {
  const actor = f.work.assigneeId;
  const initial = await startReworkAudit(
    f.inbox,
    f.store,
    actor,
    f.work.workId,
    f.policy,
    f.initial.state.identity.selection,
  );
  const { attemptId } = initial;
  await runArticleAudit(
    { ...f, attemptId, initial },
    false,
    f.inbox,
    extraReportLine,
  );
  const responses: AuditRevisionResponse[] = f.work.points.map((point) => ({
    criterion: point.criterion,
    response:
      "Добавлено сравнение сохранённых полей с отправленным черновиком.",
    reportQuote: extraReportLine ?? auditQuotes(false)["verification-chain"],
  }));
  return {
    attemptId,
    responses,
    publish: (override = responses) =>
      publishReworkedAudit(
        f.store,
        f.revisions,
        actor,
        attemptId,
        f.policy,
        override,
      ),
  };
}

export async function nextReviewer(
  f: ParentFixture & {
    iterations: ReviewIterationRepository;
    work: AuditRework;
  },
  disputed = false,
) {
  await dispatchNextReviews(f.iterations, f.queue);
  const delivery = await f.iterations.prepareNextReview(
    f.work.assigneeId,
    f.work.workId,
  );
  const { job, report } = await receiveReviewMaterials(
    f.queue,
    f.dossier,
    reviewDispatchKey(delivery),
    f.reviewerId,
    "review-repeat",
  );
  const { reviewAttemptId } = job;
  const basis = await f.conclusions.begin(f.reviewerId, reviewAttemptId);
  const context = await new ReviewReworkContextRepository(
    f.pool,
    resolveClaimedReview,
  ).read(f.reviewerId, reviewAttemptId);
  assert(context);
  const body = await buildReviewBody(
    f.evidence,
    f.reviewerId,
    reviewAttemptId,
    report,
    disputed,
  );
  body.resolutions = context.work.points.map((point) => ({
    criterion: point.criterion,
    acceptanceTest: point.acceptanceTest,
    outcome:
      body.assessments.find((a) => a.criterion === point.criterion)!.status ===
      "confirmed"
        ? "resolved"
        : "still_open",
    explanation:
      point.criterion === "verification-chain"
        ? "Проверены вызов сравнения в checkSave и поля, сопоставляемые с отправленным черновиком."
        : "Обработчик передаёт права пользователя в Payload. Успех фактической записи требует отдельной проверки в БД.",
  }));
  return { delivery, reviewAttemptId, basis, body, context };
}
