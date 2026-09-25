/**
 * @file scripts/migrations/internal-mcp.mjs
 * @version 1.0.0
 * @date 2026-09-23
 * @description Генерирует MCP client/receipt схему и блокирует разрушительный down с сохранёнными данными.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const predecessor = "20260915_082031_media_nullable_backlinks.json";

/** SQL schema/snapshot создаёт native generator; template добавляет только rollback guard. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  assert.equal(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1),
    predecessor,
    "MCP_MIGRATION_PREDECESSOR_REQUIRED",
  );
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  assert.ok(up.length && down.length, "MCP_SCHEMA_DELTA_REQUIRED");
  assert.ok(
    !/DROP (TABLE|COLUMN)/i.test(up.join("\n")),
    "MCP_ADDITIVE_MIGRATION_REQUIRED",
  );
  const tables = [
    ...up.join("\n").matchAll(/CREATE TABLE "([a-z0-9_]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    tables.sort(),
    ["ai_mcp_clients", "ai_mcp_runtime_receipts"],
    "MCP_SCHEMA_SCOPE_REQUIRED",
  );
  const dropsConstraint = (statement) =>
    /ALTER TABLE[\s\S]*DROP CONSTRAINT/.test(statement);
  const orderedDown = [
    ...down.filter(dropsConstraint),
    ...down.filter((statement) => !dropsConstraint(statement)),
  ];
  const guard = `LOCK TABLE "ai_mcp_clients", "ai_mcp_runtime_receipts", "realize_ai_integrations", "realize_ai_integration_events" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "ai_mcp_clients") OR EXISTS (SELECT 1 FROM "ai_mcp_runtime_receipts")
    OR EXISTS (SELECT 1 FROM "realize_ai_integrations" WHERE "provider" = 'mcp')
    OR EXISTS (SELECT 1 FROM "realize_ai_integration_events" WHERE "provider" = 'mcp') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MCP_ROLLBACK_BLOCKED';
  END IF;
END $$;`;
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify(up.join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([guard, ...orderedDown].join("\n"))}));`,
  };
}
