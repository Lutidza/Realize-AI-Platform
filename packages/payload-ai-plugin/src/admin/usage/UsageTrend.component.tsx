/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageTrend.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Показывает динамику расходов с доступным выбором дня и разрывами неизвестной стоимости.
 */
"use client";
import { useEffect, useId, useRef, useState } from "react";
import { UiSelect, UiSurface } from "@realize/ui-kit";
import type {
  UsageAnalysisProps,
  UsageTrendMetric,
} from "./UsageAnalytics.types";
import { buildUsageTrend } from "./buildUsageTrend.service";
import {
  formatUsageAmount,
  formatUsageCount,
} from "./usageAnalyticsPresentation.util";
import { formatUsageMoney } from "./usageMoney.util";
import styles from "./Usage.module.css";

export function UsageTrend({
  data,
  selection,
}: Pick<UsageAnalysisProps, "data" | "selection">) {
  const [metric, setMetric] = useState<UsageTrendMetric>(
    selection.currency ? "cost" : "tokens",
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState(880);
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const graph = buildUsageTrend(data, metric, selection, width);
  const index = Math.min(
    selected ?? graph.points.length - 1,
    graph.points.length - 1,
  );
  const point = graph.points[index];
  const labels = {
    cost: "Расходы",
    tokens: "Токены",
    attempts: "Вызовы модели",
  };
  const format = (value: string | null, short = false) =>
    metric === "cost"
      ? short
        ? formatUsageAmount(value, selection.currency).replace(
            ` ${selection.currency}`,
            "",
          )
        : formatUsageMoney(value, selection.currency ?? "")
      : formatUsageCount(value, short);
  const unavailable = metric === "cost" && selection.currency === null;
  return (
    <UiSurface className={`${styles.surface} ${styles.trend}`}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Динамика использования</h2>
          <p className={styles.muted}>
            По дням UTC ·{" "}
            {metric === "cost"
              ? (selection.currency ?? "денежная оценка")
              : labels[metric].toLowerCase()}
          </p>
        </div>
        <label className={styles.compactControl}>
          <span className={styles.visuallyHidden}>Показатель графика</span>
          <UiSelect
            aria-label="Показатель графика"
            value={metric}
            onChange={(event) => {
              setMetric(event.target.value as UsageTrendMetric);
              setSelected(null);
            }}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </UiSelect>
        </label>
      </div>
      <div ref={container} className={styles.chartViewport}>
        {unavailable ? (
          <div className={styles.chartEmpty}>
            <strong>Денежная оценка пока недоступна</strong>
            <p>
              Для этих операций нет подтверждённой цены. Переключитесь на токены
              или вызовы, чтобы увидеть использование.
            </p>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            role="img"
            aria-labelledby={`${id}-title ${id}-description`}
            className={styles.chart}
          >
            <title id={`${id}-title`}>
              {labels[metric]} за выбранный период
            </title>
            <desc id={`${id}-description`}>
              Дни по UTC. Разрывы означают неизвестную стоимость. Выбор дня
              доступен ползунком под графиком.
            </desc>
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--ui-color-primary)"
                  stopOpacity="0.16"
                />
                <stop
                  offset="100%"
                  stopColor="var(--ui-color-primary)"
                  stopOpacity="0.01"
                />
              </linearGradient>
            </defs>
            {[BigInt(0), BigInt(1), BigInt(2), BigInt(3), BigInt(4)].map(
              (tick) => (
                <g key={String(tick)}>
                  <line
                    x1="60"
                    x2={graph.width - 16}
                    y1={220 - Number(tick) * 49}
                    y2={220 - Number(tick) * 49}
                    className={styles.chartGrid}
                  />
                  <text
                    x="50"
                    y={224 - Number(tick) * 49}
                    textAnchor="end"
                    className={styles.chartLabel}
                  >
                    {format(
                      ((BigInt(graph.maximum) * tick) / BigInt(4)).toString(),
                      true,
                    )}
                  </text>
                </g>
              ),
            )}
            {graph.paths.length === 1 &&
              graph.points.every((p) => p.y !== null) && (
                <path
                  d={`${graph.paths[0]} L${graph.points.at(-1)!.x},220 L${graph.points[0].x},220 Z`}
                  fill={`url(#${id}-fill)`}
                />
              )}
            {graph.paths.map((path, n) => (
              <path key={n} d={path} className={styles.chartLine} />
            ))}
            {point && (
              <line
                x1={point.x}
                x2={point.x}
                y1="18"
                y2="220"
                className={styles.chartMarker}
              />
            )}
            {graph.points.map((p, n) => (
              <g key={p.day} onPointerEnter={() => setSelected(n)}>
                <rect
                  x={Math.max(
                    60,
                    p.x - (graph.width - 76) / graph.points.length / 2,
                  )}
                  y="16"
                  width={Math.max(4, (graph.width - 76) / graph.points.length)}
                  height="214"
                  fill="transparent"
                />
                {p.y !== null && (n === index || p.attempts > 0) && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={n === index ? 5 : 3}
                    className={
                      p.partial ? styles.chartPartialPoint : styles.chartPoint
                    }
                  />
                )}
              </g>
            ))}
            {[
              0,
              Math.floor((graph.points.length - 1) / 2),
              graph.points.length - 1,
            ]
              .filter((value, i, all) => all.indexOf(value) === i)
              .map((n, i) => (
                <text
                  key={n}
                  x={graph.points[n].x}
                  y="250"
                  textAnchor={
                    i === 0
                      ? "start"
                      : n === graph.points.length - 1
                        ? "end"
                        : "middle"
                  }
                  className={styles.chartLabel}
                >
                  {graph.points[n].label}
                </text>
              ))}
          </svg>
        )}
      </div>
      {!unavailable && (
        <>
          <div className={styles.chartDetail} aria-live="polite">
            <span>{point?.label}</span>
            <strong>{point ? format(point.value) : "—"}</strong>
            <span>
              {point?.partial
                ? "Известная часть · измерения неполные"
                : `Вызовов: ${formatUsageCount(point?.attempts ?? 0)}`}
            </span>
          </div>
          <input
            aria-label="День на графике"
            aria-valuetext={
              point
                ? `${point.label}: ${format(point.value)}${point.partial ? " · известная часть" : ""}`
                : "Нет измерений"
            }
            type="range"
            min={0}
            max={graph.points.length - 1}
            value={index}
            onChange={(event) => setSelected(Number(event.target.value))}
            className={styles.chartRange}
          />
        </>
      )}
    </UiSurface>
  );
}
