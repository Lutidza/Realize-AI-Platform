/**
 * @file scripts/migrations/task-workspace-intake.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Генерирует unique workspace identity задач, неизменяемый create hash и защищённый rollback.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const predecessor = "20261012_094626_extension_manager_state.json";

/** Штатный generator владеет TS/JSON/index; template добавляет проверяемые retention guards. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
    "TASK_WORKSPACE_MIGRATION_PREDECESSOR_REQUIRED",
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  assert.equal(up.length, 3, "TASK_WORKSPACE_SCHEMA_DELTA_REQUIRED");
  assert.ok(
    up.every((statement) =>
      /^(?:ALTER TABLE "realize_tasks" ADD COLUMN "workspace_(?:source_id|create_hash)" varchar;|CREATE UNIQUE INDEX "realize_tasks_workspace_source_id_idx" ON "realize_tasks" USING btree \("workspace_source_id"\);)$/.test(
        statement.trim(),
      ),
    ),
    "TASK_WORKSPACE_SCHEMA_SCOPE_REQUIRED",
  );
  const guard = `CREATE FUNCTION realize_task_workspace_source_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.workspace_source_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TASK_WORKSPACE_SOURCE_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.workspace_source_id IS DISTINCT FROM NEW.workspace_source_id OR OLD.workspace_create_hash IS DISTINCT FROM NEW.workspace_create_hash) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TASK_WORKSPACE_SOURCE_IMMUTABLE';
  END IF;
  IF (NEW.workspace_source_id IS NULL) <> (NEW.workspace_create_hash IS NULL)
    OR (NEW.workspace_source_id IS NOT NULL AND NEW.workspace_source_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
    OR (NEW.workspace_create_hash IS NOT NULL AND NEW.workspace_create_hash !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TASK_WORKSPACE_SOURCE_INVALID';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER realize_task_workspace_source_guard BEFORE INSERT OR UPDATE OR DELETE ON "realize_tasks" FOR EACH ROW EXECUTE FUNCTION realize_task_workspace_source_guard();`;
  const retention = `LOCK TABLE "realize_tasks" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "realize_tasks" WHERE workspace_source_id IS NOT NULL OR workspace_create_hash IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TASK_WORKSPACE_ROLLBACK_BLOCKED';
  END IF;
END $$;
DROP TRIGGER realize_task_workspace_source_guard ON "realize_tasks";
DROP FUNCTION realize_task_workspace_source_guard();`;
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify([...up, guard].join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([retention, ...down].join("\n"))}));`,
  };
}
