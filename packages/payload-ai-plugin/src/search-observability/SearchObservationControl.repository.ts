/**
 * @file packages/payload-ai-plugin/src/search-observability/SearchObservationControl.repository.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Управляет версией политики, очисткой и bounded runtime state под общей блокировкой записи.
 * @see documentation/architecture/repository-search.md
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import {
  SEARCH_OBSERVATION_MANAGEMENT_LIMITS as limits,
  searchObservationSettingsUpdateSchema,
  searchObservationCleanupPreviewSchema,
  type SearchObservationCleanupMode,
  type SearchObservationCleanupPreview,
  type SearchObservationSettingsUpdate,
  type SearchObservationMutationResult,
  type SearchObservationCleanupResult,
} from "@realize/ai-contracts";
import { EndpointError } from "../endpoints/http";
import { SEARCH_OBSERVATION_INITIAL_STATE } from "./searchObservation.config";
import {
  searchObservationControlStateSchema,
  searchObservationRuntimeReportSchema,
} from "./searchObservationState.schemas";
import type {
  SearchObservationControlState,
  SearchObservationRuntimeReport,
} from "./SearchObservationControl.types";
import type { SearchObservationDatabase } from "./SearchObservationStore.types";
import { withSearchObservationTransaction } from "./withSearchObservationTransaction.adapter";
import { mapSearchObservationControl } from "./mapSearchObservationControl.mapper";

export class SearchObservationControl {
  constructor(private readonly database: SearchObservationDatabase) {}

  /** Только для репозиториев feature; вызывается внутри их общей транзакции. */
  async load(client: PoolClient): Promise<SearchObservationControlState> {
    const result = await client.query(
      "SELECT state FROM realize_ai_search_state WHERE singleton_key='installation'",
    );
    return searchObservationControlStateSchema.parse(
      result.rows[0]?.state ?? SEARCH_OBSERVATION_INITIAL_STATE,
    );
  }

  async persist(client: PoolClient, state: SearchObservationControlState) {
    const serialized = JSON.stringify(
      searchObservationControlStateSchema.parse(state),
    );
    if (Buffer.byteLength(serialized) > 131072)
      throw new Error("SEARCH_STATE_SIZE_LIMIT");
    await client.query(
      `INSERT INTO realize_ai_search_state (singleton_key,state,created_at,updated_at)
      VALUES ('installation',$1::jsonb,now(),now()) ON CONFLICT (singleton_key)
      DO UPDATE SET state=EXCLUDED.state,updated_at=now()`,
      [serialized],
    );
  }

  /** Durable cutoff препятствует возвращению уже очищенного периода из очереди или импорта. */
  async prune(
    client: PoolClient,
    state: SearchObservationControlState,
    kind: SearchObservationCleanupResult["kind"],
    before?: string,
  ) {
    const started = performance.now();
    const now = Date.now();
    const cutoff = new Date(
      Math.max(
        state.clearedBefore ? Date.parse(state.clearedBefore) : 0,
        before
          ? Date.parse(before)
          : now - state.settings.retentionDays * 86400000,
      ),
    ).toISOString();
    const aged = await client.query(
      "DELETE FROM realize_ai_search_observations WHERE observed_at < $1",
      [cutoff],
    );
    let deletedCount = aged.rowCount ?? 0;
    if (kind === "automatic" || kind === "settings") {
      const overflow = await client.query(
        `DELETE FROM realize_ai_search_observations WHERE id IN
        (SELECT id FROM realize_ai_search_observations ORDER BY id DESC OFFSET $1)`,
        [state.settings.capacity],
      );
      deletedCount += overflow.rowCount ?? 0;
    }
    state.clearedBefore = cutoff;
    state.lastCleanup = {
      at: new Date(now).toISOString(),
      kind,
      deletedCount,
      durationMs: performance.now() - started,
    };
    return deletedCount;
  }

  async get() {
    return withSearchObservationTransaction(
      this.database,
      async (client) => {
        const state = await this.load(client);
        const result =
          await client.query(`SELECT count(*)::int AS count, min(observed_at) AS oldest,
        (pg_total_relation_size('realize_ai_search_observations') + pg_total_relation_size('realize_ai_search_state'))::float8 AS bytes
        FROM realize_ai_search_observations`);
        return mapSearchObservationControl(
          state,
          {
            count: result.rows[0].count,
            bytes: result.rows[0].bytes,
            oldestAt: result.rows[0].oldest?.toISOString() ?? null,
          },
          Date.now(),
        );
      },
      true,
    );
  }

  async preview(
    mode: SearchObservationCleanupMode,
  ): Promise<SearchObservationCleanupPreview> {
    return withSearchObservationTransaction(
      this.database,
      async (client) => {
        const state = await this.load(client);
        const now = Date.now();
        const before = new Date(
          mode === "history"
            ? now
            : now - state.settings.retentionDays * 86400000,
        ).toISOString();
        const count = await client.query(
          "SELECT count(*)::int AS count FROM realize_ai_search_observations WHERE observed_at < $1",
          [before],
        );
        return {
          mode,
          before,
          createdAt: new Date(now).toISOString(),
          revision: state.revision,
          count: count.rows[0].count,
        };
      },
      true,
    );
  }

  update(
    input: SearchObservationSettingsUpdate,
    requestID: string,
    actorID: string,
  ) {
    const parsed = searchObservationSettingsUpdateSchema.parse(input);
    return this.mutate(
      "settings",
      parsed.expectedRevision,
      parsed,
      requestID,
      actorID,
      async (client, state) => {
        state.settings = parsed.settings;
        return this.prune(client, state, "settings");
      },
    );
  }

  clear(
    input: SearchObservationCleanupPreview,
    requestID: string,
    actorID: string,
  ) {
    const preview = searchObservationCleanupPreviewSchema.parse(input);
    return this.mutate(
      preview.mode,
      preview.revision,
      preview,
      requestID,
      actorID,
      async (client, state) => {
        const now = Date.now();
        const created = Date.parse(preview.createdAt);
        const before = Date.parse(preview.before);
        const expected =
          preview.mode === "history"
            ? created
            : created - state.settings.retentionDays * 86400000;
        if (
          created > now + 1000 ||
          now - created > limits.previewLifetimeMs ||
          before !== expected
        )
          throw new EndpointError(
            "CONFLICT",
            "Предварительный расчёт устарел. Откройте подтверждение очистки заново.",
            409,
          );
        const current = await client.query(
          "SELECT count(*)::int AS count FROM realize_ai_search_observations WHERE observed_at < $1",
          [preview.before],
        );
        if (current.rows[0].count !== preview.count)
          throw new EndpointError(
            "CONFLICT",
            "Количество записей изменилось. Откройте подтверждение очистки заново.",
            409,
          );
        return this.prune(client, state, preview.mode, preview.before);
      },
    );
  }

  private mutate(
    kind: SearchObservationMutationResult["kind"],
    expectedRevision: number,
    input: unknown,
    requestID: string,
    actorID: string,
    execute: (
      client: PoolClient,
      state: SearchObservationControlState,
    ) => Promise<number>,
  ): Promise<SearchObservationMutationResult> {
    if (
      !z.uuid().safeParse(requestID).success ||
      !actorID ||
      actorID.length > 128
    )
      throw new EndpointError(
        "INVALID_REQUEST",
        "Для операции нужен корректный ключ повторения.",
        400,
      );
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ kind, input, actorID }))
      .digest("hex");
    return withSearchObservationTransaction(this.database, async (client) => {
      const state = await this.load(client);
      const prior = state.actions.find(
        (action) => action.requestID === requestID,
      );
      if (prior) {
        if (prior.requestHash !== requestHash || prior.actorID !== actorID)
          throw new EndpointError(
            "CONFLICT",
            "Ключ повторения уже связан с другой операцией.",
            409,
          );
        return this.receipt(prior);
      }
      if (state.revision !== expectedRevision)
        throw new EndpointError(
          "CONFLICT",
          "Настройки изменились. Обновите данные перед сохранением или очисткой.",
          409,
        );
      const deletedCount = await execute(client, state);
      const action = {
        requestID,
        requestHash,
        actorID,
        revision: ++state.revision,
        at: new Date().toISOString(),
        kind,
        deletedCount,
      };
      state.actions = [action, ...state.actions].slice(
        0,
        limits.actionCapacity,
      );
      await this.persist(client, state);
      return this.receipt(action);
    });
  }

  private receipt(
    action: SearchObservationControlState["actions"][number],
  ): SearchObservationMutationResult {
    return {
      requestID: action.requestID,
      revision: action.revision,
      at: action.at,
      kind: action.kind,
      deletedCount: action.deletedCount,
    };
  }

  /** Каждый runtime может обслуживать хранилище; общий lock и due check выбирают одну очистку. */
  async maintain(input?: SearchObservationRuntimeReport) {
    const report = input
      ? searchObservationRuntimeReportSchema.parse(input)
      : undefined;
    return withSearchObservationTransaction(this.database, async (client) => {
      const state = await this.load(client);
      const now = Date.now();
      const cleaned =
        !state.lastCleanup ||
        now - Date.parse(state.lastCleanup.at) >=
          state.settings.cleanupIntervalMinutes * 60000;
      if (cleaned) await this.prune(client, state, "automatic");
      state.runtimes = state.runtimes.filter(
        (runtime) =>
          now - Date.parse(runtime.heartbeatAt) < limits.runtimeRetentionMs,
      );
      if (report)
        state.runtimes = [
          {
            ...report,
            heartbeatAt: new Date(now).toISOString(),
            appliedRevision: state.revision,
          },
          ...state.runtimes.filter(
            (runtime) => runtime.instanceID !== report.instanceID,
          ),
        ].slice(0, limits.runtimeCapacity);
      await this.persist(client, state);
      return { revision: state.revision, cleaned };
    });
  }
}
