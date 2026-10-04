/**
 * @file tests/int/search-observation-management-postgres.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Проверяет CAS, подтверждение очистки, retention и конкуренцию на изолированной PostgreSQL.
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createLocalReq, type Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SEARCH_OBSERVATION_DEFAULT_SETTINGS } from "@realize/ai-contracts";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { SearchObservationStore } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationStore.repository";
import type { SearchObservationDatabase } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationStore.types";
import {
  up,
  down,
} from "../../src/migrations/20260928_102009_search_observation_state";
import { searchObservationFixture } from "./searchObservation.fixture";
import { SearchQualityStore } from "../../packages/payload-ai-plugin/src/search-observability/SearchQualityStore.repository";
import type { SearchQualityRun } from "@realize/ai-contracts";

describe.skipIf(!process.env.SEARCH_TEST_DATABASE_URI)(
  "search management on isolated PostgreSQL",
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
      store = new SearchObservationStore(
        payload.db as SearchObservationDatabase,
      );
    }, 60000);
    beforeEach(async () => {
      await sql.query("DELETE FROM realize_ai_search_observations");
      await sql.query("DELETE FROM realize_ai_search_state");
    });
    afterAll(async () => {
      await sql?.end();
      await payload?.destroy();
    });

    it("сохраняет дневные суммы после raw retention, не удваивает replay и фильтрует consumer", async () => {
      const old = searchObservationFixture({
        observedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        consumer: "admin",
        durationMs: 100,
      });
      const recent = searchObservationFixture({
        consumer: "review",
        durationMs: 50,
      });
      expect(await store.append([old, recent], "runtime")).toBe(2);
      expect(await store.append([old, recent], "runtime")).toBe(0);
      await store.control.update(
        {
          expectedRevision: 1,
          settings: {
            retentionDays: 1,
            capacity: 100,
            cleanupIntervalMinutes: 60,
          },
        },
        randomUUID(),
        "fixture-admin",
      );
      const page = await store.list({ hours: "168", consumer: "review" });
      expect(page.items).toHaveLength(1);
      expect(page.analytics.summary.count).toBe(1);
      expect(
        page.analytics.history!.series.reduce(
          (sum, day) => sum + day.metrics.count,
          0,
        ),
      ).toBe(2);
      expect(
        page.analytics.history!.series.every(
          (day) => day.metrics.p95Ms === null,
        ),
      ).toBe(true);
      expect(
        (await store.list({ hours: "168", consumer: "admin" })).summary.count,
      ).toBe(0);
    });
    it("сохраняет контрольные summaries идемпотентно, независимо от raw retention, и не возвращает очищенный период", async () => {
      const quality = new SearchQualityStore(
        payload.db as SearchObservationDatabase,
      );
      const run: SearchQualityRun = {
        schemaVersion: "1.0",
        id: randomUUID(),
        observedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        corpus: "repository-navigation",
        corpusVersion: "a".repeat(64),
        sourceVersion: "b".repeat(64),
        release: "fixture-v1",
        consumer: "cli",
        mode: "navigation",
        cache: "initial",
        repeat: 0,
        targets: 10,
        correctTargets: 7,
        taskDurationMs: 100,
        calls: 10,
        filesRead: 4,
        bytesRead: 300,
        outputBytes: 200,
      };
      await store.control.update(
        {
          expectedRevision: 1,
          settings: {
            retentionDays: 1,
            capacity: 100,
            cleanupIntervalMinutes: 60,
          },
        },
        randomUUID(),
        "fixture-admin",
      );
      expect(await quality.append({ runs: [run] })).toEqual({
        inserted: 1,
        retained: 1,
      });
      expect(
        await new SearchQualityStore(
          payload.db as SearchObservationDatabase,
        ).append({ runs: [run] }),
      ).toEqual({ inserted: 0, retained: 1 });
      await expect(
        quality.append({ runs: [{ ...run, correctTargets: 8 }] }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        (await store.list({ hours: "24" })).analytics.quality!.runs,
      ).toEqual([run]);
      const preview = await store.control.preview("history");
      await store.control.clear(preview, randomUUID(), "fixture-admin");
      expect(
        (await store.list({ hours: "24" })).analytics.quality!.runs,
      ).toEqual([]);
      expect(await quality.append({ runs: [run] })).toEqual({
        inserted: 0,
        retained: 0,
      });
    });
    it("denies raw state access and persists applied settings across instances", async () => {
      await expect(
        payload.create({
          collection: "realize-ai-search-state",
          data: { singletonKey: "installation", state: {} },
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
      const initial = await store.control.get();
      expect(initial.settings).toEqual(SEARCH_OBSERVATION_DEFAULT_SETTINGS);
      const settings = {
        retentionDays: 2,
        capacity: 100,
        cleanupIntervalMinutes: 5,
      };
      const input = { expectedRevision: 1, settings };
      const key = randomUUID();
      const receipt = await store.control.update(input, key, "fixture-admin");
      expect(await store.control.update(input, key, "fixture-admin")).toEqual(
        receipt,
      );
      const restarted = new SearchObservationStore(
        payload.db as SearchObservationDatabase,
      );
      expect(await restarted.control.get()).toMatchObject({
        revision: 2,
        settings,
      });
      expect((await restarted.list({ hours: "168" })).policy).toMatchObject({
        retentionDays: 2,
        capacity: 100,
      });
      await expect(
        store.control.update(input, key, "other-admin"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        store.control.update(
          { ...input, expectedRevision: 2 },
          key,
          "fixture-admin",
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        store.control.update(input, randomUUID(), "fixture-admin"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("applies shorter retention and capacity immediately without admitting delayed old events", async () => {
      const old = searchObservationFixture({
        observedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      });
      await store.append(
        [old, ...Array.from({ length: 99 }, () => searchObservationFixture())],
        "import",
      );
      await store.append(
        Array.from({ length: 10 }, () => searchObservationFixture()),
        "import",
      );
      const result = await store.control.update(
        {
          expectedRevision: 1,
          settings: {
            retentionDays: 1,
            capacity: 100,
            cleanupIntervalMinutes: 60,
          },
        },
        randomUUID(),
        "fixture-admin",
      );
      expect(result.deletedCount).toBe(10);
      expect((await store.control.get()).storage.count).toBe(100);
      expect(await store.append([old], "import")).toBe(0);
      expect((await store.control.get()).storage.count).toBe(100);
    });

    it("previews without mutation, preserves newer events and blocks resurrection on replay", async () => {
      const old = searchObservationFixture({
        observedAt: new Date(Date.now() - 1000).toISOString(),
      });
      await store.append([old], "import");
      const preview = await store.control.preview("history");
      expect(preview.count).toBe(1);
      expect((await store.control.get()).storage.count).toBe(1);
      const newer = searchObservationFixture({
        observedAt: new Date(Date.parse(preview.before) + 100).toISOString(),
      });
      await store.append([newer], "import");
      const key = randomUUID();
      const receipt = await store.control.clear(preview, key, "fixture-admin");
      expect(receipt.deletedCount).toBe(1);
      expect(await store.control.clear(preview, key, "fixture-admin")).toEqual(
        receipt,
      );
      const restarted = new SearchObservationStore(
        payload.db as SearchObservationDatabase,
      );
      expect(await restarted.append([old], "import")).toBe(0);
      expect(
        (await restarted.list({ hours: "24" })).items.map(
          (item) => item.event.eventID,
        ),
      ).toEqual([newer.eventID]);
    });

    it("rejects changed counts, expired previews and stale revisions without deleting history", async () => {
      const preview = await store.control.preview("history");
      await store.append(
        [
          searchObservationFixture({
            observedAt: new Date(Date.now() - 1000).toISOString(),
          }),
        ],
        "import",
      );
      await expect(
        store.control.clear(preview, randomUUID(), "fixture-admin"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const oldTime = new Date(Date.now() - 301000).toISOString();
      await expect(
        store.control.clear(
          { ...preview, createdAt: oldTime, before: oldTime },
          randomUUID(),
          "fixture-admin",
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const fresh = await store.control.preview("history");
      await store.control.update(
        { expectedRevision: 1, settings: SEARCH_OBSERVATION_DEFAULT_SETTINGS },
        randomUUID(),
        "fixture-admin",
      );
      await expect(
        store.control.clear(fresh, randomUUID(), "fixture-admin"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await store.control.get()).storage.count).toBe(1);
    });

    it("serializes concurrent settings, append and cleanup", async () => {
      const input = {
        expectedRevision: 1,
        settings: { ...SEARCH_OBSERVATION_DEFAULT_SETTINGS, capacity: 100 },
      };
      const updates = await Promise.allSettled([
        store.control.update(input, randomUUID(), "fixture-admin"),
        store.control.update(input, randomUUID(), "fixture-admin"),
      ]);
      expect(
        updates.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        updates.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "CONFLICT" } });
      const old = searchObservationFixture({
        observedAt: new Date(Date.now() - 1000).toISOString(),
      });
      await store.append([old], "import");
      const preview = await store.control.preview("history");
      const newer = searchObservationFixture({
        observedAt: new Date(Date.parse(preview.before) + 100).toISOString(),
      });
      await Promise.all([
        store.append([newer], "import"),
        store.control.clear(preview, randomUUID(), "fixture-admin"),
      ]);
      expect(
        (await store.list({ hours: "24" })).items.map(
          (item) => item.event.eventID,
        ),
      ).toEqual([newer.eventID]);
    });

    it("runs one due cleanup across idle runtimes and bounds heartbeat and action history", async () => {
      await store.append([searchObservationFixture()], "import");
      await sql.query(
        "UPDATE realize_ai_search_observations SET observed_at=now()-interval '8 days'",
      );
      await sql.query(
        "UPDATE realize_ai_search_state SET state=jsonb_set(state,'{lastCleanup}','null'::jsonb)",
      );
      const results = await Promise.all([
        store.control.maintain(),
        store.control.maintain(),
      ]);
      expect(results.filter((result) => result.cleaned)).toHaveLength(1);
      expect((await store.control.get()).storage.count).toBe(0);
      const report = {
        source: "cli" as const,
        startedAt: new Date().toISOString(),
        queued: 0,
        dropped: 0,
        lastDeliveredAt: null,
        lastFailureAt: null,
        errorCode: null,
      };
      for (let index = 0; index < 33; index++)
        await store.control.maintain({ ...report, instanceID: randomUUID() });
      expect((await store.control.get()).runtimes).toHaveLength(32);
      for (let revision = 1; revision <= 21; revision++)
        await store.control.update(
          {
            expectedRevision: revision,
            settings: SEARCH_OBSERVATION_DEFAULT_SETTINGS,
          },
          randomUUID(),
          "fixture-admin",
        );
      await store.control.maintain({ ...report, instanceID: randomUUID() });
      const state = await store.control.get();
      expect(state.actions).toHaveLength(20);
      expect(state.runtimes[0].appliedRevision).toBe(22);
    });

    it("protects configured state on rollback and permits fresh down/up", async () => {
      const req = await createLocalReq({}, payload);
      await store.control.update(
        { expectedRevision: 1, settings: SEARCH_OBSERVATION_DEFAULT_SETTINGS },
        randomUUID(),
        "fixture-admin",
      );
      await expect(
        payload.db.drizzle.transaction(async (db) =>
          down({ db, payload, req }),
        ),
      ).rejects.toMatchObject({
        cause: { code: "P0001", message: "SEARCH_STATE_ROLLBACK_BLOCKED" },
      });
      expect((await store.control.get()).revision).toBe(2);
      await sql.query("DELETE FROM realize_ai_search_state");
      await store.control.maintain();
      await payload.db.drizzle.transaction(async (db) =>
        down({ db, payload, req }),
      );
      expect(
        (
          await sql.query(
            "SELECT to_regclass('realize_ai_search_state') AS name",
          )
        ).rows[0].name,
      ).toBeNull();
      await payload.db.drizzle.transaction(async (db) =>
        up({ db, payload, req }),
      );
      expect((await store.control.get()).revision).toBe(1);
    });
  },
);
