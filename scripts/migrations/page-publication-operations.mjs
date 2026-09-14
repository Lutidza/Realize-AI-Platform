/**
 * @file scripts/migrations/page-publication-operations.mjs
 * @version 1.0.0
 * @date 2026-09-14
 * @description Генерирует миграцию публикации Pages с защитой сохранённых решений и доставки при down.
 * @see documentation/delivery/03-migrations-and-rollback.md
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const predecessor = "20260913_184706_page_structure_draft_operation.json";

// Блокировка закрывает промежуток между проверкой новых данных и удалением полей.
// Payload migrate:down исполняет всю функцию в одной транзакции.
const rollbackGuard = `
LOCK TABLE "realize_ai_data_operations", "realize_ai_data_operation_approvals",
  "realize_ai_data_operation_events" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "realize_ai_data_operations"
    WHERE "kind" IN ('pages.publishDraft.v1', 'pages.restorePublication.v1')
      OR "risk_level" = 'R2'
      OR "rollback_strategy" IN ('restore-publication', 'none')
  ) OR EXISTS (
    SELECT 1 FROM "realize_ai_data_operation_approvals"
    WHERE "preview_evidence" IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM "realize_ai_data_operation_events"
    WHERE "type" = 'publication_delivery_requested'
      OR "delivery_status" = 'failed'
      OR "delivery_error" IS NOT NULL
      OR "delivered_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PAGE_PUBLICATION_ROLLBACK_BLOCKED';
  END IF;
END $$;`;

/** Штатный Payload --file вызывает template до записи generated TS и index. */
export async function dynamic({ filePath, payload }) {
  assert.equal(payload.db.name, "postgres", "POSTGRES_ADAPTER_REQUIRED");
  const directory = dirname(filePath);
  const latest = readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .at(-1);
  assert.equal(latest, predecessor, "PAGE_PUBLICATION_PREDECESSOR_REQUIRED");
  const before = JSON.parse(readFileSync(join(directory, predecessor), "utf8"));
  const { generateDrizzleJson, generateMigration } =
    payload.db.requireDrizzleKit();
  const after = await generateDrizzleJson(payload.db.schema);
  const up = await generateMigration(before, after);
  const down = await generateMigration(after, before);
  assert.ok(up.length && down.length, "PAGE_PUBLICATION_SCHEMA_DELTA_REQUIRED");
  // Snapshot и SQL получают одну реальную sanitized schema, как стандартный generator.
  writeFileSync(`${filePath}.json`, JSON.stringify(after, null, 2));
  return {
    upSQL: `await db.execute(sql.raw(${JSON.stringify(up.join("\n"))}));`,
    downSQL: `await db.execute(sql.raw(${JSON.stringify([rollbackGuard, ...down].join("\n"))}));`,
  };
}
