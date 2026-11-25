/**
 * @file .ai/tools/worker-assignment/test/conclusion/reviewConclusion.fixture.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Создаёт реальную попытку и собственные квитанции ревьюера на базе проверяемого варианта отчёта.
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TestContext } from "node:test";
import {
  ReviewEvidenceRepository,
  ReviewConclusionRepository,
  ReviewAcceptanceRepository,
  REVIEW_CRITERIA,
  type ReviewAssessment,
  type ReviewBody,
  type ReviewEvidenceRef,
} from "@realize/payload-task-manager/audit-review";
import { resolveClaimedReview } from "../../src/review-queue/resolveClaimedReview.adapter";
import { reviewDispatchKey } from "../../src/review-queue/reviewDispatchKey.util";
import { receiveReviewMaterials } from "../../src/review-queue/receiveReviewMaterials.service";
import { auditReviewFixture } from "../publication/auditReview.fixture";
import {
  auditSamples,
  auditQuotes,
  runArticleAudit,
} from "./articleAuditReport.fixture";

export const sha = (text: string) =>
  createHash("sha256").update(text).digest("hex");

export async function reviewFixture(t: TestContext, disputed = false) {
  const f = await auditReviewFixture(t, true, (pilot) =>
    runArticleAudit(pilot, disputed),
  );
  const result = await f.publish();
  const delivery = await f.dossier.prepareDelivery(result.resultId);
  const submitted = await f.queue.submit(delivery);
  await f.dossier.acknowledge(delivery, submitted.jobId);
  const { job, report } = await receiveReviewMaterials(
    f.queue,
    f.dossier,
    reviewDispatchKey(delivery),
    f.reviewerId,
    "review-simulator",
  );
  const { reviewAttemptId } = job;
  const orchestratorId = f.replacementReviewer;
  const evidence = new ReviewEvidenceRepository(f.pool, resolveClaimedReview);
  const conclusions = new ReviewConclusionRepository(
    f.pool,
    resolveClaimedReview,
  );
  const acceptance = new ReviewAcceptanceRepository(f.pool);
  const config = {
    orchestratorId,
    criteriaSha256: f.lock.manifestSha256,
    policySha256: f.initial.state.identity.lockSha256,
  };
  const basis = await acceptance.configure(f.plan.auditorId, delivery, config);
  const [firstPath, firstStart, firstEnd] = auditSamples[0];
  await assert.rejects(
    evidence.read(
      f.reviewerId,
      reviewAttemptId,
      firstPath,
      firstStart,
      firstEnd,
    ),
    /review_basis_unbound/,
  );
  assert.deepEqual(
    await conclusions.begin(f.reviewerId, reviewAttemptId),
    basis,
  );
  const body = await buildReviewBody(
    evidence,
    f.reviewerId,
    reviewAttemptId,
    report,
    disputed,
  );
  return {
    ...f,
    reviewAttemptId,
    orchestratorId,
    delivery,
    evidence,
    conclusions,
    acceptance,
    basis,
    config,
    body,
  };
}

/** Имитатор ревью каждый раз получает новые квитанции из допущенной попытки. */
export async function buildReviewBody(
  evidence: ReviewEvidenceRepository,
  reviewerId: string,
  reviewAttemptId: string,
  report: Buffer,
  disputed: boolean,
): Promise<ReviewBody> {
  const refs: ReviewEvidenceRef[] = [];
  for (const [path, start, end] of auditSamples) {
    const { text, ...ref } = await evidence.read(
      reviewerId,
      reviewAttemptId,
      path,
      start,
      end,
    );
    assert(text.trim());
    assert.equal(ref.auditorCoverage, "covered");
    refs.push(ref);
  }
  const quotes = auditQuotes(disputed);
  const groups = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 1, 7, 9, 10],
    [7, 11, 12],
    [0, 10],
  ];
  const reasons = [
    "Пути из отчёта совпали с 12 файлами карты и их обязанностями.",
    "Проверены вызов из хука и обработка данных серверным действием.",
    disputed
      ? "Сервер возвращает поля, а хук сравнивает содержимое перед переходом."
      : "Проверены выборка по slug и сравнение вложенных полей с черновиком.",
    "Границы статической проверки указаны явно.",
  ];
  const assessments = REVIEW_CRITERIA.map(
    (criterion, index): ReviewAssessment => {
      assert(report.toString().includes(quotes[criterion]));
      const base = {
        criterion,
        reportQuote: quotes[criterion],
        reason: reasons[index],
        evidence: groups[index].map((i) => refs[i]),
      };
      if (disputed && criterion === "verification-chain")
        return {
          ...base,
          status: "discrepancy",
          correction: "Описать сравнение отправленных полей и разделов.",
          acceptanceTest:
            "Проследить вызов matchesSubmittedDocumentArticle из checkSave.",
        };
      return { ...base, status: "confirmed" };
    },
  );
  const body: ReviewBody = {
    schemaVersion: 1,
    recommendation: disputed ? "needs_changes" : "confirmed",
    summary: disputed
      ? "Требуется уточнить проверку результата записи."
      : "Отчёт подтверждён по четырём критериям.",
    assessments,
  };
  return body;
}
