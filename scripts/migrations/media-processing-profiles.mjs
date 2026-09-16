/**
 * @file scripts/migrations/media-processing-profiles.mjs
 * @version 1.0.0
 * @date 2026-09-15
 * @description Генерирует добавочную Media схему и запрещает down при сохранённых профилях, файлах или заданиях.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const predecessor = "20260914_083749_page_publication_operations.json";

/** Snapshot и SQL создаёт установленный генератор; ручной SQL только защищает rollback. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
    "MEDIA_MIGRATION_PREDECESSOR_REQUIRED",
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  // Drizzle ставит CASCADE перед удалением FK из остающихся таблиц; FK снимаются первыми.
  const dropsConstraint = (statement) =>
    /ALTER TABLE[\s\S]*DROP CONSTRAINT/.test(statement);
  const orderedDown = [
    ...down.filter(dropsConstraint),
    ...down.filter((statement) => !dropsConstraint(statement)),
  ];
  assert.ok(up.length && down.length, "MEDIA_SCHEMA_DELTA_REQUIRED");
  assert.ok(
    !/DROP (TABLE|COLUMN)/i.test(up.join("\n")),
    "MEDIA_ADDITIVE_MIGRATION_REQUIRED",
  );
  const tables = [
    ...up.join("\n").matchAll(/CREATE TABLE "([a-z0-9_]+)"/g),
  ].map((match) => match[1]);
  assert.ok(
    tables.includes("media_originals") &&
      tables.includes("media_processing_sets"),
    "MEDIA_TABLES_REQUIRED",
  );
  const quoted = tables.map((name) => `"${name}"`);
  const checks = quoted.map((name) => `EXISTS (SELECT 1 FROM ${name})`);
  checks.push(
    'EXISTS (SELECT 1 FROM "media" WHERE "original_id" IS NOT NULL OR "processing_profile_id" IS NOT NULL OR "managed_display" = true)',
  );
  const guard = `LOCK TABLE "media", ${quoted.join(", ")} IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF ${checks.join(" OR ")} THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDIA_PROCESSING_ROLLBACK_BLOCKED';
  END IF;
END $$;`;
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify(up.join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([guard, ...orderedDown].join("\n"))}));`,
  };
}
