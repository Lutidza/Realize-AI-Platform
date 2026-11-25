/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/ReviewReworkContext.repository.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Открывает получившему итерацию ревьюеру исходное замечание и ответы аудитора на эту доработку.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import type { Pool } from "pg";
import { withAuditTransaction } from "../withAuditTransaction.repository";
import type { ReviewAttemptAuthority } from "../conclusions/ReviewConclusion.types";
import { requireBoundReviewBasis } from "../conclusions/reviewAttemptBasis.repository";
import { readAuditRevisionLink } from "./auditRevision.repository";
import { reviewReworkContext } from "./readReworkContext.repository";

export class ReviewReworkContextRepository {
  constructor(
    private readonly pool: Pool,
    private readonly authority: ReviewAttemptAuthority,
  ) {}

  read(actorId: string, reviewAttemptId: string) {
    return withAuditTransaction(this.pool, async (client) => {
      const attempt = await this.authority(client, reviewAttemptId, actorId);
      if (
        attempt.actorId !== actorId ||
        attempt.reviewAttemptId !== reviewAttemptId
      )
        throw new Error("review_attempt_mismatch");
      await requireBoundReviewBasis(client, attempt);
      const context = await reviewReworkContext(client, attempt.delivery);
      if (!context) return null;
      const revision = await readAuditRevisionLink(
        client,
        attempt.delivery.resultId,
      );
      if (
        context.work.action === "return_audit" &&
        revision?.workId !== context.work.workId
      )
        throw new Error("audit_revision_mismatch");
      return { ...context, auditRevision: revision };
    });
  }
}
