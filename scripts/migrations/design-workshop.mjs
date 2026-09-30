/**
 * @file scripts/migrations/design-workshop.mjs
 * @version 1.0.0
 * @date 2026-09-25
 * @description Генерирует схему Мастерской и запрещает rollback при сохранённых версиях или receipts.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const predecessor = "20260925_093817_chatgpt_tunnel_status.json";
const tables = [
  "realize_design_changes",
  "realize_design_operations",
  "realize_design_projects",
  "realize_design_revisions",
];

/** SQL и snapshot создаёт установленный Drizzle; template добавляет только guarded down. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
    "WORKSHOP_MIGRATION_PREDECESSOR_REQUIRED",
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  assert.ok(up.length && down.length, "WORKSHOP_SCHEMA_DELTA_REQUIRED");
  assert.ok(
    !/DROP (TABLE|COLUMN)/i.test(up.join("\n")),
    "WORKSHOP_ADDITIVE_MIGRATION_REQUIRED",
  );
  assert.deepEqual(
    [...up.join("\n").matchAll(/CREATE TABLE "([a-z0-9_]+)"/g)]
      .map((match) => match[1])
      .sort(),
    tables,
    "WORKSHOP_SCHEMA_SCOPE_REQUIRED",
  );
  const quoted = tables.map((name) => `"${name}"`);
  const guard = `LOCK TABLE ${quoted.join(", ")} IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF ${quoted.map((name) => `EXISTS (SELECT 1 FROM ${name})`).join(" OR ")} THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKSHOP_ROLLBACK_BLOCKED';
  END IF;
END $$;`;
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify(up.join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([guard, ...down].join("\n"))}));`,
  };
}
