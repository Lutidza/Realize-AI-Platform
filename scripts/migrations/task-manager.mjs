/**
 * @file scripts/migrations/task-manager.mjs
 * @version 1.0.0
 * @date 2026-10-11
 * @description Генерирует добавочную схему постоянных задач с неизменяемой историей и безопасным down.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const predecessor = "20261004_210727_ai_usage_ledger.json";
const tables = [
  "realize_task_events",
  "realize_task_lists",
  "realize_task_operations",
  "realize_task_projects",
  "realize_task_projects_rels",
  "realize_tasks",
];
const immutableTables = ["realize_task_events", "realize_task_operations"];

/** Только установленный Drizzle создаёт SQL/snapshot; template добавляет audit и retention guards. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
    "TASK_MIGRATION_PREDECESSOR_REQUIRED",
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  assert.ok(up.length && down.length, "TASK_SCHEMA_DELTA_REQUIRED");
  assert.ok(
    !/DROP (TABLE|COLUMN)/i.test(up.join("\n")),
    "TASK_ADDITIVE_MIGRATION_REQUIRED",
  );
  assert.deepEqual(
    [...up.join("\n").matchAll(/CREATE TABLE "([a-z0-9_]+)"/g)]
      .map((match) => match[1])
      .sort(),
    tables,
    "TASK_SCHEMA_SCOPE_REQUIRED",
  );
  const historyGuard = `CREATE FUNCTION realize_task_history_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TASK_HISTORY_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;
${immutableTables.map((table) => `CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION realize_task_history_immutable();`).join("\n")}`;
  const quoted = tables.map((table) => `"${table}"`);
  const downGuard = `LOCK TABLE ${quoted.join(", ")} IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF ${quoted.map((table) => `EXISTS (SELECT 1 FROM ${table})`).join(" OR ")} THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TASK_ROLLBACK_BLOCKED';
  END IF;
END $$;`;
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify([...up, historyGuard].join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([downGuard, ...down, "DROP FUNCTION realize_task_history_immutable();"].join("\n"))}));`,
  };
}
