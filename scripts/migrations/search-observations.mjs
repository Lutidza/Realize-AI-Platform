/**
 * @file scripts/migrations/search-observations.mjs
 * @version 1.0.0
 * @date 2026-09-27
 * @description Генерирует изолированное хранилище диагностики с отказом rollback при сохранённых событиях.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const predecessor = "20260926_112722_workshop_mcp.json";
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
  const generatedDown = await generateMigration(after, before);
  // Drizzle ставит DROP TABLE CASCADE раньше DROP CONSTRAINT этой таблицы.
  // Удаляем FK первым; guard остаётся до любого DDL, остальные statements сохраняются.
  const isForeignKey = (statement) =>
    statement.includes("DROP CONSTRAINT") &&
    statement.includes("realize_ai_search_observati");
  const down = [
    ...generatedDown.filter(isForeignKey),
    ...generatedDown.filter((statement) => !isForeignKey(statement)),
  ];
  assert.ok(up.length > 0);
  assert.ok(
    up.every((statement) =>
      statement.includes("realize_ai_search_observations"),
    ),
    "SEARCH_OBSERVATION_SCHEMA_SCOPE",
  );
  const guard = `LOCK TABLE "realize_ai_search_observations" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "realize_ai_search_observations") THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SEARCH_OBSERVATIONS_ROLLBACK_BLOCKED';
  END IF;
END $$;`;
  writeFileSync(filePath + ".json", JSON.stringify(after, null, 2));
  return {
    upSQL: "await db.execute(sql.raw(" + JSON.stringify(up.join("\n")) + "));",
    downSQL:
      "await db.execute(sql.raw(" +
      JSON.stringify([guard, ...down].join("\n")) +
      "));",
  };
}
