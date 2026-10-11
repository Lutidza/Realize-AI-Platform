/**
 * @file scripts/migrations/ai-usage-ledger.mjs
 * @version 1.0.0
 * @date 2026-10-05
 * @description Генерирует закрытый usage ledger и запрещает удаление финансового evidence при rollback.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres");
  const directory = dirname(filePath);
  const predecessor = "20261004_161914_ai_execution_context.json";
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
  assert.ok(up.length > 0);
  assert.ok(
    up.every((statement) => statement.includes("realize_ai_usage_")),
    "USAGE_SCHEMA_SCOPE",
  );
  const down = [
    ...generatedDown.filter((statement) =>
      statement.includes("DROP CONSTRAINT"),
    ),
    ...generatedDown.filter(
      (statement) => !statement.includes("DROP CONSTRAINT"),
    ),
  ];
  const tables = [
    "attempts",
    "events",
    "prices",
    "budgets",
    "reservations",
  ].map((suffix) => `realize_ai_usage_${suffix}`);
  const immutable = `CREATE FUNCTION realize_ai_usage_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='USAGE_EVIDENCE_IMMUTABLE'; END $$;
CREATE TRIGGER realize_ai_usage_events_immutable BEFORE UPDATE OR DELETE ON realize_ai_usage_events
FOR EACH ROW EXECUTE FUNCTION realize_ai_usage_immutable();
CREATE TRIGGER realize_ai_usage_prices_immutable BEFORE UPDATE OR DELETE ON realize_ai_usage_prices
FOR EACH ROW EXECUTE FUNCTION realize_ai_usage_immutable();`;
  const guard = `LOCK TABLE ${tables.map((name) => `"${name}"`).join(", ")} IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN IF ${tables.map((name) => `EXISTS(SELECT 1 FROM "${name}")`).join(" OR ")} THEN
RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='USAGE_LEDGER_ROLLBACK_BLOCKED'; END IF; END $$;`;
  writeFileSync(filePath + ".json", JSON.stringify(after, null, 2));
  return {
    upSQL:
      "await db.execute(sql.raw(" +
      JSON.stringify([...up, immutable].join("\n")) +
      "));",
    downSQL:
      "await db.execute(sql.raw(" +
      JSON.stringify(
        [guard, ...down, "DROP FUNCTION realize_ai_usage_immutable();"].join(
          "\n",
        ),
      ) +
      "));",
  };
}
