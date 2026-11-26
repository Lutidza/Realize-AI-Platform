/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/ReviewEvidence.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Выдаёт ревьюеру закреплённые строки из досье и сохраняет квитанцию его попытки.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { readAuditSource } from "../AuditDossier.repository";
import { withAuditTransaction } from "../withAuditTransaction.repository";
import type { ReviewAttemptAuthority } from "./ReviewConclusion.types";
import { readAuditorCoverage } from "./readAuditorCoverage.service";
import { requireBoundReviewBasis } from "./reviewAttemptBasis.repository";

export class ReviewEvidenceRepository {
  constructor(
    private readonly pool: Pool,
    private readonly authority: ReviewAttemptAuthority,
  ) {}

  async initialize() {
    const schema = await readFile(
      new URL("./reviewEvidenceSchema.sql", import.meta.url),
      "utf8",
    );
    await withAuditTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize.audit_review_evidence.schema'))",
      );
      await client.query(schema);
    });
  }

  /** Проверяет попытку и живые права на тот же результат внутри транзакции выдачи диапазона. */
  async read(
    actorId: string,
    reviewAttemptId: string,
    path: string,
    startLine: number,
    endLine: number,
  ) {
    if (
      !Number.isSafeInteger(startLine) ||
      !Number.isSafeInteger(endLine) ||
      startLine < 1 ||
      endLine < startLine
    )
      throw new Error("review_range_invalid");
    return withAuditTransaction(this.pool, async (client) => {
      const attempt = await this.authority(client, reviewAttemptId, actorId);
      if (
        attempt.reviewAttemptId !== reviewAttemptId ||
        attempt.actorId !== actorId
      )
        throw new Error("review_evidence_mismatch");
      await requireBoundReviewBasis(client, attempt);
      const { resultId } = attempt.delivery;
      const bytes = await readAuditSource(client, resultId, path, actorId);
      // Та же нумерация строк, что у repo_read_file: пустая строка за последним LF не добавляется, CRLF сохраняется.
      const lines = bytes.toString("utf8").match(/[^\n]*\n|[^\n]+$/g) ?? [];
      if (startLine > lines.length) throw new Error("review_range_invalid");
      const actualEnd = Math.min(endLine, lines.length);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const receiptId = randomUUID();
      const range = { path, sha256, startLine, endLine: actualEnd };
      const coverageFor = await readAuditorCoverage(
        client,
        attempt.delivery,
        actorId,
      );
      const result = await client.query(
        `INSERT INTO audit_review_evidence.reads(receipt_id,result_id,review_attempt_id,actor_id,path,sha,start_line,end_line)
         SELECT $1,s.result_id,$3,$4,s.path,s.sha,$7,$8 FROM audit_dossier.sources s
         WHERE s.result_id=$2 AND s.path=$5 AND s.sha=$6`,
        [
          receiptId,
          resultId,
          reviewAttemptId,
          actorId,
          path,
          sha256,
          startLine,
          actualEnd,
        ],
      );
      if (!result.rowCount) throw new Error("review_evidence_mismatch");
      return {
        receiptId,
        ...range,
        auditorCoverage: coverageFor(range),
        text: lines.slice(startLine - 1, actualEnd).join(""),
      };
    });
  }
}
