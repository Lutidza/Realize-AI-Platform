/**
 * @file tests/int/search-observability-postgres.int.spec.ts
 * @version 1.2.0
 * @date 2026-11-03
 * @description Проверяет diagnostics schema, права, retention, dedupe и hard capacity на отдельной PostgreSQL.
 */
// @vitest-environment node
import type { SearchObservationDatabase } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationStore.types";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
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

    it("uses identical fixed bounds for history, summary and analytics, including cursor pages", async () => {
      const end = Date.now() - 3600000;
      const start = end - 3600000;
      const events = Array.from({ length: 29 }, (_, index) =>
        searchObservationFixture({
          observedAt: new Date(
            index === 0 ? start - 1 : index === 28 ? end : start + index,
          ).toISOString(),
        }),
      );
      await store.append(events, "import");
      const query = {
        from: new Date(start).toISOString(),
        to: new Date(end).toISOString(),
      };
      const page = await store.list(query);
      expect(page.summary.count).toBe(27);
      expect(page.analytics.summary.count).toBe(27);
      expect(page.items).toHaveLength(25);
      const next = await store.list({ ...query, before: page.next! });
      expect(next.items).toHaveLength(2);
      expect(next.summary.count).toBe(27);
      expect(next.analytics.summary.count).toBe(27);
      await sql.query("DELETE FROM realize_ai_search_observations");
      await sql.query("DELETE FROM realize_ai_search_state");
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
    it("aggregates all observations, compares equal windows and ignores history-only filters", async () => {
      const now = Math.floor(Date.now() / 1000) * 1000;
      const clock = vi.spyOn(Date, "now").mockReturnValue(now);
      const split = now - 12 * 3600000;
      const values = [
        {
          durationMs: 100,
          bytesRead: null,
          outcome: "complete",
          time: split - 3600000,
          returnedCount: 0,
        },
        {
          durationMs: 300,
          bytesRead: 0,
          outcome: "partial",
          time: split - 3600000,
        },
        { durationMs: 50, bytesRead: 100, outcome: "complete", time: split },
        {
          durationMs: 50,
          bytesRead: 300,
          outcome: "complete",
          time: split + 3600000,
        },
        {
          durationMs: 50,
          bytesRead: null,
          outcome: "complete",
          time: split + 3600000,
        },
        { durationMs: 50, bytesRead: 0, outcome: "error", time: now - 1000 },
      ] as const;
      const events = values.map((value) =>
        searchObservationFixture({
          operation: "definitions",
          durationMs: value.durationMs,
          bytesRead: value.bytesRead,
          outcome: value.outcome,
          observedAt: new Date(value.time).toISOString(),
          returnedCount: "returnedCount" in value ? value.returnedCount : 1,
          outputBytes: value.durationMs,
        }),
      );
      try {
        await store.append(events, "import");
        const query = {
          hours: "24",
          operation: "definitions",
          source: "cli",
        } as const;
        const page = await store.list(query);
        expect(page.analytics.summary).toMatchObject({
          count: 6,
          complete: 4,
          partial: 1,
          errors: 1,
          empty: 1,
          averageMs: 100,
          p95Ms: 250,
          averageBytesRead: 100,
          measuredReads: 4,
          averageOutputBytes: 100,
        });
        expect(page.analytics.summary.completePercent).toBeCloseTo(
          (100 * 4) / 6,
        );
        expect(page.analytics.comparison).toMatchObject({
          unavailableReason: null,
          speedImprovementPercent: 75,
          completeChangePoints: 25,
          readReductionPercent: null,
          before: {
            metrics: { count: 2, averageMs: 200, completePercent: 50 },
          },
          after: { metrics: { count: 4, averageMs: 50, completePercent: 75 } },
        });
        const filtered = await store.list({
          ...query,
          outcome: "error",
          slow: "true",
          before: "1",
        });
        expect(filtered.items).toEqual([]);
        expect(filtered.analytics).toEqual(page.analytics);
        expect(
          (await store.list({ ...query, source: "mcp" })).analytics.summary
            .count,
        ).toBe(0);
        expect(
          (await store.list({ ...query, operation: "references" })).analytics
            .summary.count,
        ).toBe(0);
        const custom = await store.list({
          ...query,
          compareAt: new Date(now - 3600000).toISOString(),
        });
        expect(
          Date.parse(custom.analytics.comparison.before.to) -
            Date.parse(custom.analytics.comparison.before.from),
        ).toBe(3600000);
        expect(
          Date.parse(custom.analytics.comparison.after.to) -
            Date.parse(custom.analytics.comparison.after.from),
        ).toBe(3600000);
        expect(custom.analytics.comparison.unavailableReason).toBe(
          "missing_samples",
        );
      } finally {
        clock.mockRestore();
        await sql.query(
          "DELETE FROM realize_ai_search_observations WHERE event->>'eventID' = ANY($1::text[])",
          [events.map((event) => event.eventID)],
        );
      }
    });
    it("keeps analytics independent of pagination and excludes future observations", async () => {
      const now = Date.now();
      const events = Array.from({ length: 30 }, (_, index) =>
        searchObservationFixture({
          operation: "references",
          durationMs: index < 29 ? 10 : 1000,
          observedAt: new Date(now - 1000).toISOString(),
        }),
      );
      const future = searchObservationFixture({
        operation: "references",
        observedAt: new Date(now + 60000).toISOString(),
        durationMs: 5000,
      });
      try {
        await store.append([...events, future], "import");
        const first = await store.list({
          hours: "24",
          operation: "references",
        });
        expect(first.items).toHaveLength(25);
        expect(first.summary.count).toBe(31);
        expect(first.analytics.summary).toMatchObject({
          count: 30,
          averageMs: 43,
        });
        const next = await store.list({
          hours: "24",
          operation: "references",
          before: first.next!,
        });
        expect(next.items).toHaveLength(6);
        expect(next.analytics.summary).toEqual(first.analytics.summary);
        expect(
          first.analytics.series.reduce(
            (count, point) => count + point.metrics.count,
            0,
          ),
        ).toBe(30);
      } finally {
        await sql.query(
          "DELETE FROM realize_ai_search_observations WHERE event->>'eventID' = ANY($1::text[])",
          [[...events, future].map((event) => event.eventID)],
        );
      }
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
