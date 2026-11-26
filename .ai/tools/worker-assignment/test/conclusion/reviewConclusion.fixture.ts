/**
 * @file .ai/tools/worker-assignment/test/conclusion/reviewConclusion.fixture.ts
 * @version 1.1.17
 * @date 2026-11-26
 * @description Создаёт реальную попытку и собственные квитанции ревьюера на базе проверяемого варианта отчёта.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import {
  ReviewEvidenceRepository,
  ReviewConclusionRepository,
  ReviewAcceptanceRepository,
  REVIEW_CRITERIA,
  type AuditFileCoverage,
  type ReviewAssessment,
  type ReviewBody,
  type ReviewEvidenceRef,
} from "@realize/payload-task-manager/audit-review";
import { resolveClaimedReview } from "../../src/review-queue/resolveClaimedReview.adapter";
import { reviewDispatchKey } from "../../src/review-queue/reviewDispatchKey.util";
import { receiveReviewMaterials } from "../../src/review-queue/receiveReviewMaterials.service";
import { auditReviewFixture } from "../publication/auditReview.fixture";
import { sampleCheckpointAudit } from "../checkpoints/sampleCheckpointAudit.fixture";
import {
  sampleAuditReviewParticipants,
  sampleReviewProjectRoles,
} from "../publication/auditReviewParticipants.fixture";
import {
  auditQuotes,
  describeAuditRead,
  runAuditReport,
} from "./auditReport.fixture";

export const sha = (text: string) =>
  createHash("sha256").update(text).digest("hex");

export async function reviewFixture(
  t: TestContext,
  disputed = false,
  audit = sampleCheckpointAudit(),
) {
  const f = await auditReviewFixture(t, {
    audit,
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
      projectTitle: "Заключения ревьюеров",
      projectDescription: "",
      listTitle: "Проверка отчётов",
      taskTitle: "Подготовить заключение по отчёту аудитора",
      taskDescription: "",
      status: "review",
      priority: "normal",
      gitBindings: [],
    },
    projectRoles: sampleReviewProjectRoles,
    runAudit: (scenario) => runAuditReport(scenario, disputed),
  });
  const result = await f.publish();
  const delivery = await f.dossier.prepareDelivery(result.resultId);
  const submitted = await f.queue.submit(delivery);
  await f.dossier.acknowledge(delivery, submitted.jobId);
  const { job, report, coverage } = await receiveReviewMaterials(
    f.queue,
    f.dossier,
    reviewDispatchKey(delivery),
    f.reviewerId,
    "review-simulator",
  );
  const { reviewAttemptId } = job;
  const orchestratorId = f.participantIds.replacementReviewer;
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
  const basis = await acceptance.configure(f.ownerId, delivery, config);
  const [first] = audit.simulator.reads;
  assert(first, "Для проверки права на чтение требуется источник");
  await assert.rejects(
    evidence.read(
      f.reviewerId,
      reviewAttemptId,
      first.path,
      first.startLine,
      first.startLine,
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
    coverage,
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
  evidence: Pick<ReviewEvidenceRepository, "read">,
  reviewerId: string,
  reviewAttemptId: string,
  report: Buffer,
  coverage: Buffer,
  disputed: boolean,
): Promise<ReviewBody> {
  const refs: ReviewEvidenceRef[] = [];
  const files: AuditFileCoverage[] = JSON.parse(coverage.toString("utf8"));
  const reportLines = new Set(report.toString("utf8").split("\n"));
  for (const { path, sha256, receipts } of files) {
    for (const { startLine, endLine } of receipts) {
      if (endLine < startLine) continue;
      const { text, ...ref } = await evidence.read(
        reviewerId,
        reviewAttemptId,
        path,
        startLine,
        endLine,
      );
      assert(text.length > 0);
      assert.equal(ref.auditorCoverage, "covered");
      assert.deepEqual(
        [ref.path, ref.sha256, ref.startLine, ref.endLine],
        [path, sha256, startLine, endLine],
      );
      assert(reportLines.has(describeAuditRead(ref)));
      refs.push(ref);
    }
  }
  assert(
    refs.length > 0,
    "В карте покрытия нет прочитанных строк для заключения",
  );
  const quotes = auditQuotes(disputed);
  const reasons = {
    responsibilities: "Источники из карты покрытия найдены в отчёте.",
    "create-chain":
      "По квитанциям из карты перечитаны строки закреплённых файлов.",
    "verification-chain": disputed
      ? "Квитанция связывает путь с SHA-256 конкретной версии."
      : "Пути и SHA-256 независимо сверены с картой покрытия.",
    "findings-and-limits":
      "Границы чтений в отчёте совпали с квитанциями ревьюера.",
  };
  const assessments = REVIEW_CRITERIA.map((criterion): ReviewAssessment => {
    assert(reportLines.has(quotes[criterion]));
    const base = {
      criterion,
      reportQuote: quotes[criterion],
      reason: reasons[criterion],
      evidence: [...refs],
    };
    if (disputed && criterion === "verification-chain")
      return {
        ...base,
        status: "discrepancy",
        correction: "Указать, как определяется версия прочитанного файла.",
        acceptanceTest:
          "Сверить путь и SHA-256 с квитанцией независимого чтения.",
      };
    return { ...base, status: "confirmed" };
  });
  const body: ReviewBody = {
    schemaVersion: 1,
    recommendation: disputed ? "needs_changes" : "confirmed",
    summary: disputed
      ? "Требуется уточнить проверку версии файла."
      : "Отчёт подтверждён по четырём критериям.",
    assessments,
  };
  return body;
}
