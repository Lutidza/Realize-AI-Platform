/**
 * @file scripts/migrations/ai-execution-context.mjs
 * @version 1.0.0
 * @date 2026-10-04
 * @description Генерирует private AI context на CR/job без подстановки latest в историю.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres");
  const directory = dirname(filePath);
  const predecessor = "20260928_102009_search_observation_state.json";
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
  assert.equal(up.length, 2);
  assert.ok(
    up.every((statement) =>
      /^ALTER TABLE "realize_ai_(?:change_requests|execution_jobs)" ADD COLUMN "execution_context" jsonb;$/.test(
        statement,
      ),
    ),
    "AI_CONTEXT_SCHEMA_SCOPE",
  );
  const guard = `LOCK TABLE "realize_ai_change_requests", "realize_ai_execution_jobs" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "realize_ai_change_requests" WHERE execution_context IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "realize_ai_execution_jobs" WHERE execution_context IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AI_CONTEXT_ROLLBACK_BLOCKED';
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
