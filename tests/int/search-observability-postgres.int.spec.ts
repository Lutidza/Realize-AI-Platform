/**
 * @file tests/int/search-observability-postgres.int.spec.ts
 * @version 1.0.2
 * @date 2026-09-28
 * @description Проверяет diagnostics schema, права, retention, dedupe и hard capacity на отдельной PostgreSQL.
 */
// @vitest-environment node
import type { SearchObservationDatabase } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationStore.types";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createLocalReq, type Payload } from "payload";
import {
  down,
  up,
} from "../../src/migrations/20260927_070914_search_observations";
import { SearchObservationStore } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationStore.repository";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { searchObservationFixture } from "./searchObservation.fixture";

describe.skipIf(!process.env.SEARCH_TEST_DATABASE_URI)(
  "search observations on isolated PostgreSQL",
  () => {
    let payload: Payload;
    let sql: Client;
    let store: SearchObservationStore;
    beforeAll(async () => {
      const url = new URL(process.env.SEARCH_TEST_DATABASE_URI!);
      if (
        url.hostname !== "127.0.0.1" ||
        !/^realize_search_fixture_[a-z0-9]+$/.test(url.pathname.slice(1)) ||
        process.env.DATABASE_URI !== url.href
      )
        throw new Error("ISOLATED_SEARCH_DATABASE_REQUIRED");
      payload = await openMcpPayload();
      sql = new Client({ connectionString: url.href });
      await sql.connect();
      // Повторный прогон очищает только коллекцию выделенной fixture БД после guard выше.
      await sql.query("DELETE FROM realize_ai_search_observations");
      await sql.query("DELETE FROM realize_ai_search_state");
      store = new SearchObservationStore(
        payload.db as SearchObservationDatabase,
      );
    }, 60000);
    afterAll(async () => {
      await sql?.end();
      await payload?.destroy();
    });

    it("denies raw collection CRUD and persists only an explicit DTO", async () => {
      const event = searchObservationFixture();
      await expect(
        payload.create({
          collection: "realize-ai-search-observations",
          data: {
            storageKey: event.eventID,
            origin: "import",
            source: "cli",
            outcome: "complete",
            observedAt: event.observedAt,
            durationMs: 12,
            event,
          },
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(await store.append([event], "import")).toBe(1);
      expect(await store.append([event], "import")).toBe(0);
      await expect(
        store.append([{ ...event, returnedCount: 5 }], "import"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const page = await store.list({ hours: "24" });
      expect(page.items[0].event).toEqual(event);
      expect(Object.keys(page.items[0]).sort()).toEqual([
        "event",
        "id",
        "origin",
      ]);
      expect(page.items[0].origin).toBe("import");
    });
    it("enforces timestamp, source and strict input before writes", async () => {
      await expect(
        store.append([searchObservationFixture({ source: "mcp" })], "import"),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      for (const age of [-8 * 86400000, 3600000])
        await expect(
          store.append(
            [
              searchObservationFixture({
                observedAt: new Date(Date.now() + age).toISOString(),
              }),
            ],
            "import",
          ),
        ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(
        store.append(
          [{ ...searchObservationFixture(), query: "private" } as never],
          "runtime",
        ),
      ).rejects.toThrow();
    });
    it("keeps pagination stable on inserts and filters statistics", async () => {
      const batch = Array.from({ length: 30 }, () =>
        searchObservationFixture({
          source: "mcp",
          profile: "mcp",
          outputUnit: "mcp_result_json_utf8",
          coordinates: "unicode_codepoints_1based",
          durationMs: 1500,
          outcome: "partial",
          reason: "page_limit",
        }),
      );
      await store.append(batch, "runtime");
      const first = await store.list({
        hours: "24",
        source: "mcp",
        slow: "true",
      });
      expect(first.items).toHaveLength(25);
      expect(first.summary).toEqual({
        count: 30,
        errors: 0,
        partial: 30,
        averageMs: 1500,
        p95Ms: 1500,
      });
      await store.append(
        [
          searchObservationFixture({
            source: "mcp",
            profile: "mcp",
            outputUnit: "mcp_result_json_utf8",
            coordinates: "unicode_codepoints_1based",
          }),
        ],
        "runtime",
      );
      const second = await store.list({
        hours: "24",
        source: "mcp",
        slow: "true",
        before: first.next!,
      });
      expect(second.items).toHaveLength(5);
      expect(
        second.items.some((row) =>
          first.items.some((old) => old.id === row.id),
        ),
      ).toBe(false);
      expect(second.next).toBeNull();
    });
    it("prunes expired rows and bounds concurrent writers to 10000 rows", async () => {
      const event = searchObservationFixture();
      await sql.query(
        `INSERT INTO realize_ai_search_observations (storage_key, origin, source, outcome, observed_at, duration_ms, event, created_at, updated_at)
      SELECT 'capacity-fixture:' || n, 'import', 'cli', 'complete', now(), 1, $1::jsonb, now(), now() FROM generate_series(1,10010) n`,
        [JSON.stringify(event)],
      );
      await sql.query(
        "UPDATE realize_ai_search_observations SET observed_at = now() - interval '8 days' WHERE storage_key = 'capacity-fixture:10010'",
      );
      await Promise.all([
        store.append([searchObservationFixture()], "import"),
        store.append([searchObservationFixture()], "import"),
      ]);
      const counts = await sql.query(
        "SELECT count(*)::int AS total, count(*) FILTER (WHERE observed_at < now() - interval '7 days')::int AS expired FROM realize_ai_search_observations",
      );
      expect(counts.rows[0]).toEqual({ total: 10000, expired: 0 });
      // Удаляются только явно созданные stress-fixtures данного теста в одноразовой БД.
      await sql.query(
        "DELETE FROM realize_ai_search_observations WHERE storage_key LIKE 'capacity-fixture:%'",
      );
    });
    it("blocks destructive rollback with data and allows empty down/up", async () => {
      const before = await sql.query(
        "SELECT count(*)::int AS total FROM realize_ai_search_observations",
      );
      expect(before.rows[0].total).toBeGreaterThan(0);
      const req = await createLocalReq({}, payload);
      await expect(
        payload.db.drizzle.transaction(async (db) =>
          down({ db, payload, req }),
        ),
      ).rejects.toMatchObject({
        cause: {
          code: "P0001",
          message: "SEARCH_OBSERVATIONS_ROLLBACK_BLOCKED",
        },
      });
      expect(
        (
          await sql.query(
            "SELECT count(*)::int AS total FROM realize_ai_search_observations",
          )
        ).rows[0],
      ).toEqual(before.rows[0]);
      await sql.query("DELETE FROM realize_ai_search_observations");
      await payload.db.drizzle.transaction(async (db) =>
        down({ db, payload, req }),
      );
      expect(
        (
          await sql.query(
            "SELECT to_regclass('realize_ai_search_observations') AS name",
          )
        ).rows[0].name,
      ).toBeNull();
      await payload.db.drizzle.transaction(async (db) =>
        up({ db, payload, req }),
      );
      expect(await store.append([searchObservationFixture()], "import")).toBe(
        1,
      );
    });
  },
);
