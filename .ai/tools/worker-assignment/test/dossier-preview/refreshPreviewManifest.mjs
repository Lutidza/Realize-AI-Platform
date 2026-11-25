/**
 * @file .ai/tools/worker-assignment/test/dossier-preview/refreshPreviewManifest.mjs
 * @version 1.0.0
 * @date 2026-11-26
 * @description Восстанавливает указатель на последний принятый аудит из сохранённых записей Foundation и досье.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { pgEnvironment, workspace } from "./previewCluster.mjs";

/** Manifest содержит публичные ссылки preview; байты отчёта и данные входа остаются у их владельцев. */
export async function refreshPreviewManifest() {
  const database = {
    host: pgEnvironment.PGHOST,
    port: Number(pgEnvironment.PGPORT),
    name: pgEnvironment.PGDATABASE,
    user: "realize_dossier_reader",
    webUser: "realize_dossier_web",
  };
  const client = new pg.Client({
    host: database.host,
    port: database.port,
    database: database.name,
    user: pgEnvironment.PGUSER,
    ssl: false,
  });
  await client.connect();
  try {
    const installed = await client.query(
      "SELECT to_regclass('audit_acceptance.decisions') IS NOT NULL AS ready",
    );
    if (!installed.rows[0].ready) return null;
    const result = await client.query(`
      SELECT task.task_id AS "taskId", task.project_id AS "projectId", execution.execution_id AS "executionId",
        task.record->>'status' AS "taskStatus", report.attempt_id AS "auditAttemptId",
        conclusion.review_attempt_id AS "reviewAttemptId",
        author.actor_id AS "auditorId", reviewer.actor_id AS "reviewerId", inbox.actor_id AS "orchestratorId",
        report.result_id AS "resultId", (report.manifest::jsonb->>'resultRevision')::int AS "resultRevision",
        conclusion.result_id AS "conclusionId", (conclusion.manifest::jsonb->>'revision')::int AS "conclusionRevision",
        decision.decision_id AS "decisionId", decision.manifest->>'action' AS "action"
      FROM audit_acceptance.decisions decision JOIN audit_conclusions.results conclusion ON conclusion.result_id=decision.conclusion_id
      JOIN audit_acceptance.inbox inbox ON inbox.conclusion_id=conclusion.result_id
      JOIN audit_dossier.results report ON report.result_id=conclusion.audit_result_id
      JOIN public.realize_tasks task ON task.task_id=conclusion.task_id AND task.task_id=report.task_id
      JOIN audit_review.executions execution ON execution.execution_id=report.manifest::jsonb#>>'{task,executionId}'
      JOIN audit_review.assignments author ON author.execution_id=execution.execution_id AND author.role='auditor'
        AND author.plan_revision=(report.manifest::jsonb#>>'{task,planRevision}')::int
      JOIN audit_review.assignments reviewer ON reviewer.execution_id=author.execution_id AND reviewer.plan_revision=author.plan_revision AND reviewer.role='reviewer'
      WHERE decision.manifest->>'action'='accept_audit' AND inbox.actor_id=decision.manifest->>'actorId'
      ORDER BY (decision.manifest->>'createdAt')::timestamptz DESC,decision.decision_id DESC LIMIT 1`);
    if (!result.rowCount) return null;
    const manifest = { schemaVersion: 1, database, ...result.rows[0] };
    const json = JSON.stringify(manifest, null, 2) + "\n";
    const history = join(workspace, "runs");
    await mkdir(history, { recursive: true, mode: 0o700 });
    for (const destination of [
      join(history, manifest.taskId + ".json"),
      join(workspace, "manifest.json"),
    ]) {
      const temporary = destination + ".tmp";
      await writeFile(temporary, json, { mode: 0o600, flush: true });
      await rename(temporary, destination);
    }
    return json;
  } finally {
    await client.end();
  }
}
