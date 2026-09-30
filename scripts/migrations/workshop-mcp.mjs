/**
 * @file scripts/migrations/workshop-mcp.mjs
 * @version 1.0.0
 * @date 2026-09-26
 * @description Генерирует MCP channel и trusted preview binding с защитой сохранённых данных при rollback.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const predecessor = "20260925_170325_design_preview.json";

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
  assert.equal(up.length, 2, "WORKSHOP_MCP_SCOPE_REQUIRED");
  assert.ok(
    up.some((statement) =>
      /ALTER TYPE.*enum_realize_design_revisions_channel.*ADD VALUE.*mcp/.test(
        statement,
      ),
    ),
  );
  assert.ok(
    up.some((statement) =>
      /ALTER TABLE "realize_design_preview_jobs" ADD COLUMN "mcp_authorization" jsonb/.test(
        statement,
      ),
    ),
  );
  const guard = `LOCK TABLE "realize_design_revisions", "realize_design_preview_jobs" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "realize_design_revisions" WHERE "channel" = 'mcp') OR EXISTS (SELECT 1 FROM "realize_design_preview_jobs" WHERE "mcp_authorization" IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKSHOP_MCP_ROLLBACK_BLOCKED';
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
