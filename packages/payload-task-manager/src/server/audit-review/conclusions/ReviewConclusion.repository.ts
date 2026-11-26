/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/ReviewConclusion.repository.ts
 * @version 1.1.2
 * @date 2026-11-26
 * @description Публикует неизменяемое заключение попытки ревью, сохраняет событие и проверяет доступ к досье.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { assertReviewRead } from "../auditReviewPlan.repository";
import { withAuditTransaction } from "../withAuditTransaction.repository";
import type {
  PublishedConclusion,
  ReviewAttemptAuthority,
  ReviewBasis,
  ReviewBody,
  ReviewConclusionContent as ConclusionContent,
  ReviewConclusionRow as ConclusionRow,
} from "./ReviewConclusion.types";
import { assertOrchestratorRead } from "./reviewAcceptanceBasis.repository";
import {
  loadConclusion,
  readConclusionRow,
} from "./readConclusionRevision.repository";
import { reviewReworkContext } from "../rework/readReworkContext.repository";
export { loadConclusion } from "./readConclusionRevision.repository";
import {
  bindReviewAttemptBasis,
  requireBoundReviewBasis,
} from "./reviewAttemptBasis.repository";
import { validateReviewConclusion } from "./validateReviewConclusion.validator";

const hash = (bytes: string) =>
  createHash("sha256").update(bytes, "utf8").digest("hex");

/** Сортирует ключи объектов. Порядок типизированных критериев и доказательств задаёт валидатор. */
function encodeContent(content: ConclusionContent) {
  return JSON.stringify(content, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value;
    const fields = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(fields)
        .sort()
        .map((key) => [key, fields[key]]),
    );
  });
}

/** Историческая запись доступна по актуальному разрешению участника или уполномоченного оркестратора. */
async function requireConclusionRead(
  client: PoolClient,
  conclusion: PublishedConclusion,
  actorId: string,
) {
  try {
    await assertReviewRead(client, conclusion.delivery.task, actorId);
    return;
  } catch (error) {
    if (!(error instanceof Error && error.message === "review_access_denied"))
      throw error;
  }
  try {
    await assertOrchestratorRead(client, conclusion.delivery, actorId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "orchestrator_access_denied"
    )
      throw new Error("review_access_denied");
    throw error;
  }
}

/** Authority повторно открывает уже выданную попытку runtime и проверяет её владельца в этой транзакции. */
export class ReviewConclusionRepository {
  constructor(
    private readonly pool: Pool,
    private readonly authority: ReviewAttemptAuthority,
  ) {}

  private async resolveAttempt(
    client: PoolClient,
    reviewAttemptId: string,
    actorId: string,
  ) {
    const attempt = await this.authority(client, reviewAttemptId, actorId);
    if (
      attempt.reviewAttemptId !== reviewAttemptId ||
      attempt.actorId !== actorId ||
      !attempt.jobId
    )
      throw new Error("review_attempt_mismatch");
    return attempt;
  }

  async initialize() {
    const schema = await readFile(
      new URL("./conclusionSchema.sql", import.meta.url),
      "utf8",
    );
    await withAuditTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize.audit_conclusions.schema'))",
      );
      await client.query(schema);
    });
  }

  /** Закрепляет исходные критерии выданной попытки до подготовки доказательств независимого ревью. */
  begin(actorId: string, reviewAttemptId: string): Promise<ReviewBasis> {
    return withAuditTransaction(this.pool, async (client) => {
      const attempt = await this.resolveAttempt(
        client,
        reviewAttemptId,
        actorId,
      );
      await reviewReworkContext(client, attempt.delivery);
      return bindReviewAttemptBasis(client, attempt);
    });
  }

  /** Точный повтор выдаёт исходную версию, изменённая семантика одной попытки отклоняется. */
  async publish(
    actorId: string,
    reviewAttemptId: string,
    basis: ReviewBasis,
    body: ReviewBody,
  ): Promise<PublishedConclusion> {
    if (!basis || typeof basis !== "object")
      throw new Error("review_basis_stale");
    const expected = structuredClone(basis);
    const submitted = structuredClone(body);
    return withAuditTransaction(this.pool, async (client) => {
      const attempt = await this.resolveAttempt(
        client,
        reviewAttemptId,
        actorId,
      );
      const { jobId, delivery } = attempt;
      const current = await requireBoundReviewBasis(client, attempt, expected);
      const normalized = await validateReviewConclusion(
        client,
        actorId,
        reviewAttemptId,
        delivery,
        submitted,
      );
      const content: ConclusionContent = {
        revision: delivery.rework?.conclusionRevision ?? 1,
        reviewAttemptId,
        jobId,
        reviewerId: actorId,
        delivery,
        basis: current,
        body: normalized,
      };
      const bytes = encodeContent(content);
      const digest = hash(bytes);
      const conclusionId = randomUUID();
      const stored = await client.query<ConclusionRow>(
        `INSERT INTO audit_conclusions.results
           (result_id,task_id,audit_result_id,review_attempt_id,content_sha256,manifest)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (review_attempt_id) DO NOTHING
         RETURNING result_id,manifest,content_sha256`,
        [
          conclusionId,
          delivery.task.taskId,
          delivery.resultId,
          reviewAttemptId,
          digest,
          bytes,
        ],
      );
      if (!stored.rowCount) {
        const previous = await client.query<ConclusionRow>(
          "SELECT result_id,manifest,content_sha256 FROM audit_conclusions.results WHERE review_attempt_id=$1",
          [reviewAttemptId],
        );
        const row = previous.rows[0];
        if (!row || row.content_sha256 !== digest || row.manifest !== bytes)
          throw new Error("review_conclusion_conflict");
        return readConclusionRow(row);
      }
      if (delivery.rework) {
        const successor = await client.query(
          `INSERT INTO audit_conclusions.successors(work_id,parent_id,conclusion_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [
            delivery.rework.workId,
            delivery.rework.parentConclusionId,
            conclusionId,
          ],
        );
        if (!successor.rowCount) throw new Error("review_conclusion_conflict");
      }
      await client.query(
        "INSERT INTO audit_conclusions.published_events(result_id) VALUES ($1)",
        [conclusionId],
      );
      return readConclusionRow(stored.rows[0]);
    });
  }

  /** Актуальные полномочия проверяются независимо от времени публикации и выдачи попытки. */
  read(conclusionId: string, actorId: string): Promise<PublishedConclusion> {
    return withAuditTransaction(this.pool, async (client) => {
      const conclusion = await loadConclusion(client, conclusionId);
      await requireConclusionRead(client, conclusion, actorId);
      return conclusion;
    });
  }

  listForTask(taskId: string, actorId: string): Promise<PublishedConclusion[]> {
    return withAuditTransaction(this.pool, async (client) => {
      const rows = await client.query<ConclusionRow>(
        "SELECT result_id,manifest,content_sha256 FROM audit_conclusions.results WHERE task_id=$1 ORDER BY created_at,result_id",
        [taskId],
      );
      const allowed: PublishedConclusion[] = [];
      for (const row of rows.rows) {
        const conclusion = readConclusionRow(row);
        try {
          await requireConclusionRead(client, conclusion, actorId);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "review_access_denied"
          )
            continue;
          throw error;
        }
        allowed.push(conclusion);
      }
      return allowed;
    });
  }
}
