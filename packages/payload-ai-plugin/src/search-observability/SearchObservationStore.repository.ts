/**
 * @file packages/payload-ai-plugin/src/search-observability/SearchObservationStore.repository.ts
 * @version 1.5.0
 * @date 2026-11-03
 * @description Хранит диагностику по действующей политике, сохраняя dedupe и границу очищенной истории.
 * @see documentation/architecture/repository-search.md
 */
import {
  searchObservationSchema,
  type SearchObservation,
  type SearchObservationPage,
  type SearchObservationQuery,
} from "@realize/ai-contracts";
import { EndpointError } from "../endpoints/http";
import { SEARCH_OBSERVATION_POLICY } from "./searchObservation.config";
import { mapSearchObservation } from "./mapSearchObservation.mapper";
import type {
  SearchObservationDatabase,
  SearchObservationRow,
} from "./SearchObservationStore.types";
import { SearchObservationControl } from "./SearchObservationControl.repository";
import { withSearchObservationTransaction } from "./withSearchObservationTransaction.adapter";
import { readSearchObservationAnalytics } from "./readSearchObservationAnalytics.repository";
import {
  initializeSearchAggregateHistory,
  retainSearchAggregateHistory,
  mapSearchAggregateHistory,
} from "./retainSearchAggregateHistory.service";
import { resolveSearchObservationWindow } from "./resolveSearchObservationWindow.service";
import { mapSearchQualityHistory } from "./mapSearchQualityHistory.mapper";

export class SearchObservationStore {
  readonly control: SearchObservationControl;

  constructor(private readonly database: SearchObservationDatabase) {
    this.control = new SearchObservationControl(database);
  }

  /** Запись, policy и очистка используют один lock; очищенный период больше не принимается. */
  async append(events: SearchObservation[], origin: "runtime" | "import") {
    if (events.length > SEARCH_OBSERVATION_POLICY.queueCapacity)
      throw new Error("SEARCH_OBSERVATION_BATCH_LIMIT");
    const parsed = events.map((event) => searchObservationSchema.parse(event));
    const now = Date.now();
    if (
      parsed.some(
        (event) =>
          Date.parse(event.observedAt) <
            now - SEARCH_OBSERVATION_POLICY.retentionDays * 86400000 ||
          Date.parse(event.observedAt) > now + 300000 ||
          (origin === "import" && event.source !== "cli"),
      )
    )
      throw new EndpointError(
        "INVALID_REQUEST",
        "Допустима диагностика CLI за последние 7 дней без будущих дат.",
        400,
      );
    return withSearchObservationTransaction(this.database, async (client) => {
      const state = await this.control.load(client);
      await initializeSearchAggregateHistory(client, state);
      const cutoff = Math.max(
        Date.now() - state.settings.retentionDays * 86400000,
        state.clearedBefore ? Date.parse(state.clearedBefore) : 0,
      );
      // Поздняя доставка старого периода подтверждается без повторной записи и retry-loop.
      const values = parsed.filter(
        (event) => Date.parse(event.observedAt) >= cutoff,
      );
      const inserted = await client.query(
        `INSERT INTO realize_ai_search_observations
        (storage_key,origin,source,outcome,observed_at,duration_ms,event,created_at,updated_at)
        SELECT $2 || ':' || (e->>'eventID'),$2,e->>'source',e->>'outcome',
          (e->>'observedAt')::timestamptz,(e->>'durationMs')::numeric,e,now(),now()
        FROM jsonb_array_elements($1::jsonb) e ON CONFLICT (storage_key) DO NOTHING RETURNING id,event`,
        [JSON.stringify(values), origin],
      );
      const conflict = await client.query(
        `SELECT 1 FROM realize_ai_search_observations stored
        JOIN jsonb_array_elements($1::jsonb) incoming ON stored.storage_key=$2 || ':' || (incoming->>'eventID')
        WHERE stored.event <> incoming LIMIT 1`,
        [JSON.stringify(values), origin],
      );
      if (conflict.rows.length)
        throw new EndpointError(
          "CONFLICT",
          "Этот eventID уже связан с другой диагностикой.",
          409,
        );
      retainSearchAggregateHistory(
        state,
        inserted.rows.map((row) => searchObservationSchema.parse(row.event)),
      );
      await this.control.prune(client, state, "automatic");
      await this.control.persist(client, state);
      return inserted.rowCount ?? 0;
    });
  }

  async list(query: SearchObservationQuery): Promise<SearchObservationPage> {
    return withSearchObservationTransaction(
      this.database,
      async (client) => {
        const state = await this.control.load(client);
        const now = Date.now();
        const window = resolveSearchObservationWindow(
          query,
          now,
          Math.max(
            now - state.settings.retentionDays * 86400000,
            state.clearedBefore ? Date.parse(state.clearedBefore) : 0,
          ),
        );
        const analytics = await readSearchObservationAnalytics(
          client,
          query,
          now,
          window.availableFrom,
        );
        analytics.history = mapSearchAggregateHistory(state);
        analytics.quality = mapSearchQualityHistory(state.qualityRuns);
        const params: unknown[] = [new Date(window.availableFrom)];
        const conditions = ["observed_at >= $1"];
        // Фиксированное окно исключает конец; скользящая история сохраняет допуск часов producer.
        if (query.to) {
          params.push(new Date(window.to));
          conditions.push(`observed_at < $${params.length}`);
        }
        for (const [column, value] of [
          ["source", query.source],
          ["outcome", query.outcome],
        ] as const) {
          if (value) {
            params.push(value);
            conditions.push(`${column} = $${params.length}`);
          }
        }
        if (query.operation) {
          params.push(query.operation);
          conditions.push(`event->>'operation' = $${params.length}`);
        }
        if (query.consumer) {
          params.push(query.consumer);
          conditions.push(`event->>'consumer' = $${params.length}`);
        }
        if (query.slow) {
          params.push(SEARCH_OBSERVATION_POLICY.slowMs);
          conditions.push(`duration_ms >= $${params.length}`);
        }
        const where = conditions.join(" AND ");
        const summary = await client.query(
          `SELECT count(*)::int AS count,
        count(*) FILTER (WHERE outcome='error')::int AS errors,
        count(*) FILTER (WHERE outcome='partial')::int AS partial,
        avg(duration_ms)::float8 AS "averageMs", percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::float8 AS "p95Ms"
        FROM realize_ai_search_observations WHERE ${where}`,
          params,
        );
        if (query.before) {
          params.push(Number(query.before));
          conditions.push(`id < $${params.length}`);
        }
        const result = await client.query<SearchObservationRow>(
          `SELECT id,origin,event FROM realize_ai_search_observations
        WHERE ${conditions.join(" AND ")} ORDER BY id DESC LIMIT 26`,
          params,
        );
        const items = result.rows.slice(0, 25).map(mapSearchObservation);
        return {
          analytics,
          items,
          next: result.rows.length > 25 ? items.at(-1)!.id : null,
          summary: {
            count: summary.rows[0].count,
            errors: summary.rows[0].errors,
            partial: summary.rows[0].partial,
            averageMs: summary.rows[0].averageMs,
            p95Ms: summary.rows[0].p95Ms,
          },
          policy: {
            ...SEARCH_OBSERVATION_POLICY,
            retentionDays: state.settings.retentionDays,
            capacity: state.settings.capacity,
          },
        };
      },
      true,
    );
  }
}
