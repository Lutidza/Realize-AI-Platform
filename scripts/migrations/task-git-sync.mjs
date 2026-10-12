/**
 * @file scripts/migrations/task-git-sync.mjs
 * @version 1.0.0
 * @date 2026-10-12
 * @description Генерирует добавочное immutable хранилище Git-снимков и запрещает потерю истории при down.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const predecessor = "20261011_162630_task_manager_foundation.json";
const table = "realize_task_git_syncs";

/** SQL и snapshot создаёт установленный Drizzle; Foundation владеет общей immutable trigger function. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
    "TASK_GIT_MIGRATION_PREDECESSOR_REQUIRED",
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  assert.ok(up.length && down.length, "TASK_GIT_SCHEMA_DELTA_REQUIRED");
  assert.ok(
    !/DROP (TABLE|COLUMN)/i.test(up.join("\n")),
    "TASK_GIT_ADDITIVE_REQUIRED",
  );
  assert.deepEqual(
    [...up.join("\n").matchAll(/CREATE TABLE "([a-z0-9_]+)"/g)].map(
      (match) => match[1],
    ),
    [table],
    "TASK_GIT_SCHEMA_SCOPE_REQUIRED",
  );
  const immutable = `CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION realize_task_history_immutable();`;
  const retention = `LOCK TABLE "${table}" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "${table}") THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TASK_GIT_ROLLBACK_BLOCKED';
  END IF;
END $$;`;
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify([...up, immutable].join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([retention, ...down].join("\n"))}));`,
  };
}
