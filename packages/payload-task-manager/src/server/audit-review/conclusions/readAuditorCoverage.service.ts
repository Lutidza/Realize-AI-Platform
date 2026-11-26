/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/readAuditorCoverage.service.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Определяет пересечение предметной ссылки с закреплённой картой фактических чтений аудитора.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { readAuditArtifact } from "../AuditDossier.repository";
import type {
  AuditFileCoverage,
  ReviewDelivery,
} from "../AuditPublication.types";
import type { ReviewEvidenceRef } from "./ReviewConclusion.types";

/** При публикации досье уже проверило и объединило смежные диапазоны по каждой версии файла. */
export async function readAuditorCoverage(
  client: PoolClient,
  delivery: ReviewDelivery,
  actorId: string,
) {
  const bytes = await readAuditArtifact(
    client,
    delivery.resultId,
    "coverage",
    actorId,
  );
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    delivery.coverage.sha256
  )
    throw new Error("review_evidence_mismatch");
  const files: AuditFileCoverage[] = JSON.parse(bytes.toString("utf8"));
  return (
    ref: Pick<ReviewEvidenceRef, "path" | "sha256" | "startLine" | "endLine">,
  ): ReviewEvidenceRef["auditorCoverage"] => {
    const file = files.find(
      (row) => row.path === ref.path && row.sha256 === ref.sha256,
    );
    if (
      file?.ranges.some(
        (range) =>
          range.startLine <= ref.startLine && range.endLine >= ref.endLine,
      )
    )
      return "covered";
    if (
      file?.ranges.some(
        (range) =>
          range.endLine >= ref.startLine && range.startLine <= ref.endLine,
      )
    )
      return "partial";
    return "unread";
  };
}
