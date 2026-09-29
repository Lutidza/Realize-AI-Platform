/**
 * @file scripts/migrations/search-observation-state.mjs
 * @version 1.0.0
 * @date 2026-09-30
 * @description Генерирует изолированное управление диагностикой с защитой сохранённых решений при rollback.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres");
  const directory = dirname(filePath);
  const predecessor = readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .at(-1);
  assert.match(predecessor ?? "", /^\d{8}_\d{6}_search_observations\.json$/);
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const generatedDown = await generateMigration(after, before);
  assert.ok(up.length > 0);
  assert.ok(
    up.every((statement) => statement.includes("realize_ai_search_state")),
    "SEARCH_STATE_SCHEMA_SCOPE",
  );
  const foreignKey = (statement) =>
    statement.includes("DROP CONSTRAINT") &&
    statement.includes("realize_ai_search_state");
  const down = [
    ...generatedDown.filter(foreignKey),
    ...generatedDown.filter((statement) => !foreignKey(statement)),
  ];
  const guard = `LOCK TABLE "realize_ai_search_state" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "realize_ai_search_state" WHERE (state->>'revision')::bigint > 1) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SEARCH_STATE_ROLLBACK_BLOCKED';
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
