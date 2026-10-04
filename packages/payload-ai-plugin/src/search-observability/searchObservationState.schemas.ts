/**
 * @file packages/payload-ai-plugin/src/search-observability/searchObservationState.schemas.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Ограничивает persistent policy, runtime snapshots и журнал операций диагностики.
 */
import { z } from "zod";
import { searchQualityRunSchema } from "@realize/ai-contracts";
import { searchAggregateHistorySchema } from "./searchAggregateHistory.schemas";
import {
  searchObservationSettingsSchema,
  SEARCH_OBSERVATION_MANAGEMENT_LIMITS as limits,
} from "@realize/ai-contracts";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const instant = z.iso.datetime();

export const searchObservationRuntimeReportSchema = z.strictObject({
  instanceID: z.uuid(),
  source: z.enum(["cli", "mcp"]),
  startedAt: instant,
  queued: count.max(100),
  dropped: count,
  lastDeliveredAt: instant.nullable(),
  lastFailureAt: instant.nullable(),
  errorCode: z.enum(["delivery_unavailable", "buffer_unavailable"]).nullable(),
});

const runtime = searchObservationRuntimeReportSchema.extend({
  heartbeatAt: instant,
  appliedRevision: revision,
});

const action = z.strictObject({
  requestID: z.uuid(),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  actorID: z.string().min(1).max(128),
  revision,
  at: instant,
  kind: z.enum(["settings", "expired", "history"]),
  deletedCount: count,
});

export const searchObservationControlStateSchema = z.strictObject({
  qualityClearedBefore: instant.nullable().default(null),
  aggregateHistory: searchAggregateHistorySchema.default({
    initialized: false,
    availableFrom: null,
    days: [],
  }),
  qualityRuns: z.array(searchQualityRunSchema).max(64).default([]),
  revision,
  settings: searchObservationSettingsSchema,
  clearedBefore: instant.nullable(),
  lastCleanup: z
    .strictObject({
      at: instant,
      kind: z.enum(["automatic", "settings", "expired", "history"]),
      deletedCount: count,
      durationMs: z.number().finite().nonnegative(),
    })
    .nullable(),
  runtimes: z.array(runtime).max(limits.runtimeCapacity),
  actions: z.array(action).max(limits.actionCapacity),
});
