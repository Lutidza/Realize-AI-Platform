/**
 * @file packages/payload-ai-plugin/src/search-observability/resolveSearchObservationWindow.service.ts
 * @version 1.0.0
 * @date 2026-11-03
 * @description Разрешает общий период истории и аналитики с учётом retention и очистки.
 * @see documentation/architecture/repository-search.md
 */
import {
  searchObservationQuerySchema,
  type SearchObservationQuery,
} from "@realize/ai-contracts";
import { EndpointError } from "../endpoints/http";
import type { SearchObservationAnalyticsWindow } from "./SearchObservationAnalytics.types";

/** Верхняя граница исключена; доступность данных не расширяет запрошенное окно. */
export function resolveSearchObservationWindow(
  query: SearchObservationQuery,
  now: number,
  availableFrom: number,
): SearchObservationAnalyticsWindow {
  const parsed = searchObservationQuerySchema.safeParse(query);
  if (!parsed.success)
    throw new EndpointError(
      "INVALID_REQUEST",
      "Выберите корректный период длительностью не более 7 дней.",
      400,
    );
  const to = parsed.data.to ? Date.parse(parsed.data.to) : now;
  const from = parsed.data.from
    ? Date.parse(parsed.data.from)
    : to - Number(parsed.data.hours) * 3600000;
  if (to > now)
    throw new EndpointError(
      "INVALID_REQUEST",
      "Конец периода не может быть в будущем.",
      400,
    );
  const splitAt = query.compareAt
    ? Date.parse(query.compareAt)
    : (from + to) / 2;
  if (!Number.isFinite(splitAt) || splitAt <= from || splitAt >= to)
    throw new EndpointError(
      "INVALID_REQUEST",
      "Дата сравнения должна находиться внутри выбранного периода.",
      400,
    );
  const half = Math.min(splitAt - from, to - splitAt);
  return {
    from,
    to,
    availableFrom: Math.max(from, availableFrom),
    splitAt,
    beforeFrom: splitAt - half,
    afterTo: splitAt + half,
    buckets: 24,
    bucketMs: (to - from) / 24,
  };
}
