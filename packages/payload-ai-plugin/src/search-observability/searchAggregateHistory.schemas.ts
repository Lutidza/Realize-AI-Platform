/**
 * @file packages/payload-ai-plugin/src/search-observability/searchAggregateHistory.schemas.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Ограничивает дневные агрегаты без запросов, путей, run IDs и raw ответов.
 */
import { z } from "zod";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sum = z.number().finite().nonnegative();
export const searchAggregateDaySchema = z.strictObject({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count,
  complete: count,
  errors: count,
  partial: count,
  cancelled: count,
  empty: count,
  durationMs: sum,
  bytesRead: sum,
  measuredReads: count,
  outputBytes: sum,
});
export const searchAggregateHistorySchema = z.strictObject({
  initialized: z.boolean(),
  availableFrom: z.iso.datetime().nullable(),
  days: z.array(searchAggregateDaySchema).max(181),
});
