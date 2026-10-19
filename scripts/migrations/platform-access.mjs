/**
 * @file scripts/migrations/platform-access.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Генерирует закрытую access schema и запрещает rollback с сохранёнными credentials или device grants.
 * @see documentation/architecture/platform-access.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const predecessor = "20261019_065606_task_workspace_intake.json";
const tables = [
  "access_credentials",
  "access_device_requests",
  "access_rate_limits",
  "access_refresh_history",
];

/** Штатный generator обновляет TS/JSON/index; template проверяет границы DDL и retention. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
    "ACCESS_MIGRATION_PREDECESSOR_REQUIRED",
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  // Snapshots — JSON: drizzle runtime может содержать own properties со значением undefined.
  const after = JSON.parse(
    JSON.stringify(await generateDrizzleJson(payload.db.schema)),
  );
  const added = Object.keys(after.tables)
    .filter((key) => !before.tables[key])
    .sort();
  assert.deepEqual(
    added,
    tables.map((name) => `public.${name}`).sort(),
    "ACCESS_SCHEMA_TABLES_REQUIRED",
  );
  for (const [key, value] of Object.entries(before.tables))
    assert.deepEqual(
      after.tables[key],
      value,
      "ACCESS_EXISTING_TABLE_CHANGE_FORBIDDEN",
    );
  assert.deepEqual(after.enums, before.enums, "ACCESS_ENUM_CHANGE_FORBIDDEN");
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  const retained = tables.filter((table) => table !== "access_rate_limits");
  const retention = `LOCK TABLE ${tables.map((table) => `"${table}"`).join(", ")} IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF ${retained.map((table) => `EXISTS (SELECT 1 FROM "${table}")`).join(" OR ")} THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACCESS_ROLLBACK_BLOCKED';
  END IF;
END $$;`;
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify(up.join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([retention, ...down].join("\n"))}));`,
  };
}
