/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/readConclusionRevision.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Открывает неизменяемую версию заключения и проверяет хеш его сохранённых байтов.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  PublishedConclusion,
  ReviewConclusionContent,
  ReviewConclusionRow,
} from "./ReviewConclusion.types";

export function readConclusionRow(
  row: ReviewConclusionRow,
): PublishedConclusion {
  if (
    createHash("sha256").update(row.manifest, "utf8").digest("hex") !==
    row.content_sha256
  )
    throw new Error("review_conclusion_corrupt");
  const content: ReviewConclusionContent = JSON.parse(row.manifest);
  return {
    ...content,
    conclusionId: row.result_id,
    sha256: row.content_sha256,
  };
}

/** Внутреннее чтение для авторизованных операций решения и последующего ревью. */
export async function loadConclusion(
  client: PoolClient,
  conclusionId: string,
): Promise<PublishedConclusion> {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(conclusionId))
    throw new Error("review_conclusion_unavailable");
  const result = await client.query<ReviewConclusionRow>(
    "SELECT result_id,manifest,content_sha256 FROM audit_conclusions.results WHERE result_id=$1",
    [conclusionId],
  );
  if (!result.rowCount) throw new Error("review_conclusion_unavailable");
  return readConclusionRow(result.rows[0]);
}
