/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/auditRevisionLinks.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Возвращает происхождение исправленной версии для доверенной транзакции выдачи следующего ревью.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import type { PoolClient } from "pg";
import type { PublishedAudit } from "../AuditPublication.types";
import type { AuditRevisionLink } from "./AuditRevision.types";

/** Для первой версии отчёта связи доработки нет. Выдача наружу проверяет права у владельца результата. */
export async function readAuditRevisionLink(
  client: PoolClient,
  resultId: string,
): Promise<AuditRevisionLink | null> {
  const link = await client.query<AuditRevisionLink>(
    `SELECT work_id AS "workId", result_id AS "resultId", parent_result_id AS "parentResultId",
      parent_revision AS "parentRevision", decision_id AS "decisionId", parent_conclusion_id AS "conclusionId",
      parent_conclusion_sha AS "parentConclusionSha256", parent_conclusion_revision AS "parentConclusionRevision",
      iteration,responses FROM audit_dossier.revision_links WHERE result_id=$1`,
    [resultId],
  );
  return link.rows[0] ?? null;
}

/** Восстанавливает ранее зафиксированную публикацию по ID поручения. */
export async function readAuditRevisionForWork(
  client: PoolClient,
  workId: string,
): Promise<PublishedAudit | null> {
  const saved = await client.query<{ manifest: string }>(
    `SELECT r.manifest FROM audit_dossier.revision_links l JOIN audit_dossier.results r USING(result_id)
     WHERE l.work_id=$1`,
    [workId],
  );
  return saved.rowCount ? JSON.parse(saved.rows[0].manifest) : null;
}
