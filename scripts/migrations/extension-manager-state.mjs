/**
 * @file scripts/migrations/extension-manager-state.mjs
 * @version 1.0.0
 * @date 2026-10-12
 * @description Генерирует добавочную appearance schema, SQL-защиту receipts и безопасный rollback.
 * @see documentation/specifications/extension-management.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const predecessor = "20261011_215235_task_git_sync.json";
const tables = [
  "realize_extension_manager_receipts",
  "realize_extension_manager_state",
];

/** Installed Drizzle владеет SQL/snapshot; добавочные guards защищают подтверждённые операции. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
    "EXTENSION_MIGRATION_PREDECESSOR_REQUIRED",
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  assert.ok(up.length && down.length, "EXTENSION_SCHEMA_DELTA_REQUIRED");
  assert.ok(
    !/DROP (TABLE|COLUMN)/i.test(up.join("\n")),
    "EXTENSION_ADDITIVE_MIGRATION_REQUIRED",
  );
  assert.deepEqual(
    [...up.join("\n").matchAll(/CREATE TABLE "([a-z0-9_]+)"/g)]
      .map((match) => match[1])
      .sort(),
    tables,
    "EXTENSION_SCHEMA_SCOPE_REQUIRED",
  );
  const immutable = `CREATE FUNCTION realize_extension_receipts_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXTENSION_RECEIPT_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER realize_extension_manager_receipts_immutable BEFORE UPDATE OR DELETE ON "realize_extension_manager_receipts" FOR EACH ROW EXECUTE FUNCTION realize_extension_receipts_immutable();`;
  const quoted = tables.map((table) => `"${table}"`);
  const downGuard = `LOCK TABLE ${quoted.join(", ")} IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF ${quoted.map((table) => `EXISTS (SELECT 1 FROM ${table})`).join(" OR ")} THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXTENSION_ROLLBACK_BLOCKED';
  END IF;
END $$;`;
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify([...up, immutable].join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([downGuard, ...down, "DROP FUNCTION realize_extension_receipts_immutable();"].join("\n"))}));`,
  };
}
