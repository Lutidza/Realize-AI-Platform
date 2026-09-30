/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/useSearchObservationTrend.hook.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Управляет показателем и доступным с клавиатуры выбором интервала графика.
 */
"use client";
import { useEffect, useRef, useState } from "react";
import type { SearchObservationAnalytics } from "@realize/ai-contracts";
import type { SearchObservationTrendMetric } from "./SearchObservations.types";
import { buildSearchObservationTrend } from "./searchObservationAnalyticsPresentation.util";

export function useSearchObservationTrend(
  analytics: SearchObservationAnalytics,
) {
  const [metric, setMetric] =
    useState<SearchObservationTrendMetric>("averageMs");
  const [selected, setSelected] = useState<number | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const graph = buildSearchObservationTrend(analytics, metric, width);
  const point = selected === null ? undefined : graph.points[selected];
  return {
    metric,
    containerRef,
    graph,
    point,
    selected,
    setSelected,
    selectMetric: (value: string) => {
      if (
        value === "averageMs" ||
        value === "completePercent" ||
        value === "averageBytesRead"
      )
        setMetric(value);
    },
  };
}
