/**
 * @file .ai/tools/worker-assignment/test/publication/initializeReviewDatabase.fixture.mjs
 * @version 1.0.2
 * @date 2026-11-26
 * @description Подготавливает в одноразовом кластере действующую исходную схему Foundation из штатных миграций.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { withAuditTransaction } from "@realize/payload-task-manager/audit-review";
import { up as createCore } from "../../../../../src/migrations/20260817_124443_baseline_core_schema.ts";
import { up as createFoundation } from "../../../../../src/migrations/20261011_162630_task_manager_foundation.ts";
import { openAssignmentTestPool } from "../checkpoints/checkpointStorage.fixture.ts";

const pool = openAssignmentTestPool();
try {
  await withAuditTransaction(pool, async (client) => {
    await client.query("SET LOCAL search_path TO public, pg_catalog");
    const db = drizzle(client);
    await createCore({ db });
    await createFoundation({ db });
  });
} finally {
  await pool.end();
}
