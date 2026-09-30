/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/searchObservationAnalyticsPresentation.util.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Форматирует измерения и координаты графика с разрывами в пустых интервалах.
 */
import type { SearchObservationAnalytics } from "@realize/ai-contracts";
import type {
  SearchObservationTrendMetric,
  SearchObservationMetricUnit,
} from "./SearchObservations.types";

export function formatSearchMetric(
  value: number | null,
  unit: SearchObservationMetricUnit,
) {
  if (value === null) return "Нет измерений";
  const number = (amount: number) =>
    amount.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  if (unit === "percent") return number(value) + " %";
  if (unit === "ms") return number(value) + " мс";
  return value >= 1024 * 1024
    ? number(value / (1024 * 1024)) + " МиБ"
    : value >= 1024
      ? number(value / 1024) + " КиБ"
      : number(value) + " Б";
}

export function formatSearchDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function searchComparisonChange(value: number | null, points = false) {
  if (value === null) return "Недостаточно данных";
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  if (!rounded) return "Без изменения";
  return (
    (value > 0 ? "+" : "−") +
    rounded.toLocaleString("ru-RU") +
    (points ? " п. п." : " %")
  );
}

export function buildSearchObservationTrend(
  data: SearchObservationAnalytics,
  metric: SearchObservationTrendMetric,
  width = 800,
) {
  const left = 64;
  const right = Math.max(left + 100, width - 16);
  const plotWidth = right - left;
  const unit: SearchObservationMetricUnit =
    metric === "averageMs"
      ? "ms"
      : metric === "completePercent"
        ? "percent"
        : "bytes";
  const values = data.series.map((interval) => interval.metrics[metric]);
  const maximum =
    metric === "completePercent"
      ? 100
      : Math.max(1, ...values.filter((v) => v !== null));
  const points = data.series.map((interval, index) => ({
    interval,
    value: values[index],
    x: left + ((index + 0.5) / data.series.length) * plotWidth,
    y: values[index] === null ? null : 196 - (values[index] / maximum) * 160,
    label:
      formatSearchDate(interval.from) + " — " + formatSearchDate(interval.to),
  }));
  let connected = false;
  const line = points
    .map((point) => {
      if (point.y === null) {
        connected = false;
        return "";
      }
      const command = connected ? "L" : "M";
      connected = true;
      return command + point.x + "," + point.y;
    })
    .join(" ");
  const from = Date.parse(data.from);
  const span = Date.parse(data.to) - from;
  return {
    points,
    line,
    maximum,
    unit,
    width,
    left,
    right,
    markerX: left + ((Date.parse(data.splitAt) - from) / span) * plotWidth,
    ticks: (width < 480
      ? [0, 1]
      : width < 720
        ? [0, 0.5, 1]
        : [0, 0.25, 0.5, 0.75, 1]
    ).map((ratio) => ({
      x: left + ratio * plotWidth,
      label: formatSearchDate(new Date(from + span * ratio).toISOString()),
    })),
  };
}
