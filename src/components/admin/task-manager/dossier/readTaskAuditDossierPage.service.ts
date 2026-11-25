/**
 * @file src/components/admin/task-manager/dossier/readTaskAuditDossierPage.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Загружает материалы через PostgreSQL той же установки Payload, которая удостоверила читателя.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import "server-only";
import { getPayload } from "payload";
import configPromise from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { readTaskAuditDossier } from "@realize/payload-task-manager/audit-review";
export async function readTaskAuditDossierPage(
  actorId: string,
  taskId: string,
  decisionId: string,
) {
  const payload = await getPayload({ config: configPromise });
  if (payload.db.name !== "postgres" || !("pool" in payload.db))
    throw new Error("audit_database_unavailable");
  const adapter = payload.db as unknown as PostgresAdapter;
  return readTaskAuditDossier(adapter.pool, actorId, taskId, decisionId);
}
