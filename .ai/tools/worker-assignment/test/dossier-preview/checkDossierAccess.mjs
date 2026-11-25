/**
 * @file .ai/tools/worker-assignment/test/dossier-preview/checkDossierAccess.mjs
 * @version 1.1.0
 * @date 2026-11-26
 * @description Проверяет материалы решения и ACL из настоящего подключения под тестовой SQL-ролью чтения.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { readTaskAuditDossier } from "@realize/payload-task-manager/audit-review";
import { pgEnvironment, workspace } from "./previewCluster.mjs";

const manifest = JSON.parse(
  await readFile(join(workspace, "manifest.json"), "utf8"),
);
const pool = new pg.Pool({
  host: pgEnvironment.PGHOST,
  port: Number(pgEnvironment.PGPORT),
  database: pgEnvironment.PGDATABASE,
  user: "realize_dossier_reader",
  ssl: false,
});
try {
  const read = (actorId) =>
    readTaskAuditDossier(pool, actorId, manifest.taskId, manifest.decisionId);
  const card = await read(manifest.orchestratorId);
  assert.equal(card?.report.resultId, manifest.resultId);
  assert.equal(card?.conclusion.conclusionId, manifest.conclusionId);
  assert.equal(card?.decision.decisionId, manifest.decisionId);
  assert.equal(card.decision.action, "accept_audit");
  assert.equal(await read(manifest.auditorId), null);
  assert.equal(await read(manifest.reviewerId), null);
  const rights = (
    await pool.query(`
    SELECT current_user AS actor, current_setting('transaction_read_only') AS read_only,
      has_table_privilege(current_user,'audit_dossier.materials','SELECT') AS raw,
      has_table_privilege(current_user,'audit_dossier.sources','SELECT') AS sources,
      has_table_privilege(current_user,'public.users','SELECT') AS users,
      has_table_privilege(current_user,'audit_acceptance.decisions','UPDATE') AS writer
  `)
  ).rows[0];
  assert.deepEqual(rights, {
    actor: "realize_dossier_reader",
    read_only: "on",
    raw: false,
    sources: false,
    users: false,
    writer: false,
  });
  const web = (
    await pool.query(`
      SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,
        has_table_privilege(rolname,'public.realize_tasks','SELECT') AS task_read,
        has_table_privilege(rolname,'public.realize_tasks','UPDATE') AS task_write,
        has_table_privilege(rolname,'audit_acceptance.decisions','UPDATE') AS decision_write,
        has_table_privilege(rolname,'audit_dossier.materials','SELECT') AS raw_read,
        has_table_privilege(rolname,'public.users_sessions','INSERT') AS session_write
      FROM pg_roles WHERE rolname='realize_dossier_web'
    `)
  ).rows[0];
  assert.deepEqual(web, {
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolbypassrls: false,
    task_read: true,
    task_write: false,
    decision_write: false,
    raw_read: false,
    session_write: true,
  });
  const webClient = new pg.Client({
    host: manifest.database.host,
    port: manifest.database.port,
    database: manifest.database.name,
    user: manifest.database.webUser,
    ssl: false,
  });
  await webClient.connect();
  try {
    await webClient.query("BEGIN");
    try {
      const removed = await webClient.query(
        "DELETE FROM public.users_roles WHERE parent_id=$1",
        [manifest.orchestratorId],
      );
      const added = await webClient.query(
        "INSERT INTO public.users_roles(parent_id,value,\"order\") VALUES($1,'admin',0)",
        [manifest.auditorId],
      );
      assert.equal(removed.rowCount, 0);
      assert.equal(added.rowCount, 0);
    } finally {
      await webClient.query("ROLLBACK");
    }
    // Даже ошибка теста не должна оставить новую учётную запись или изменение существующей.
    for (const [sql, values, reason] of [
      [
        "INSERT INTO public.users(id,name,email) VALUES(-88412,'preview test','deny-create@example.invalid')",
        [],
        "preview_web_account_creation_denied",
      ],
      [
        "UPDATE public.users SET name='preview test' WHERE id=$1",
        [manifest.orchestratorId],
        "preview_web_account_change_denied",
      ],
    ]) {
      await webClient.query("BEGIN");
      try {
        await assert.rejects(webClient.query(sql, values), {
          code: "42501",
          message: reason,
        });
      } finally {
        await webClient.query("ROLLBACK");
      }
    }
  } finally {
    await webClient.end();
  }
  console.log(
    "Подтверждены три материала, отказ двум другим участникам и ограничения SQL-ролей читателя и веб-службы.",
  );
} finally {
  await pool.end();
}
