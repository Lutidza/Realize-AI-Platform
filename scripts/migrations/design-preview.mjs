/**
 * @file scripts/migrations/design-preview.mjs
 * @version 1.0.0
 * @date 2026-09-25
 * @description Генерирует единственную очередь preview и guarded rollback сохранённых заданий.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const predecessor = "20260925_133735_design_workshop.json";
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  assert.ok(up.length && down.length);
  assert.ok(!/DROP (TABLE|COLUMN)/i.test(up.join("\n")));
  assert.deepEqual(
    [...up.join("\n").matchAll(/CREATE TABLE "([a-z0-9_]+)"/g)].map(
      (match) => match[1],
    ),
    ["realize_design_preview_jobs"],
  );
  const guard =
    "LOCK TABLE \"realize_design_preview_jobs\" IN ACCESS EXCLUSIVE MODE;\nDO $$ BEGIN IF EXISTS (SELECT 1 FROM \"realize_design_preview_jobs\") THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKSHOP_PREVIEW_ROLLBACK_BLOCKED'; END IF; END $$;";
  writeFileSync(filePath + ".json", JSON.stringify(after, null, 2));
  return {
    upSQL: "await db.execute(sql.raw(" + JSON.stringify(up.join("\n")) + "));",
    downSQL:
      "await db.execute(sql.raw(" +
      JSON.stringify([guard, ...down].join("\n")) +
      "));",
  };
}
