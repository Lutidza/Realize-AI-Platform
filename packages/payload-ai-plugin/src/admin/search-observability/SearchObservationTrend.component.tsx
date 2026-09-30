/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationTrend.component.tsx
 * @version 1.0.0
 * @date 2026-09-30
 * @description Показывает динамику реальных замеров и отметку сравнения с выбором точек мышью и клавиатурой.
 */
import { UiSelect } from "@realize/ui-kit";
import type { SearchObservationTrendProps } from "./SearchObservations.types";
import { useSearchObservationTrend } from "./useSearchObservationTrend.hook";
import {
  formatSearchDate,
  formatSearchMetric,
} from "./searchObservationAnalyticsPresentation.util";
import { searchTrendLabels } from "./searchObservationPresentation.config";
import styles from "./SearchObservations.module.css";

export function SearchObservationTrend({
  analytics,
}: SearchObservationTrendProps) {
  const trend = useSearchObservationTrend(analytics);
  const { graph } = trend;
  return (
    <section
      ref={trend.containerRef}
      aria-label="Динамика поиска"
      className={styles.trend}
    >
      <div className={styles.actions}>
        <h3>Динамика поиска</h3>
        <label className={styles.metricSelector}>
          Показатель на графике
          <UiSelect
            value={trend.metric}
            onChange={(event) => trend.selectMetric(event.target.value)}
          >
            {Object.entries(searchTrendLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </UiSelect>
        </label>
      </div>
      {graph.points.some((point) => point.y !== null) ? (
        <>
          <div className={styles.chartViewport}>
            <svg
              viewBox={`0 0 ${graph.width} 248`}
              role="group"
              aria-label={
                searchTrendLabels[trend.metric] + ": график по времени"
              }
              className={styles.chart}
            >
              <title>
                {searchTrendLabels[trend.metric]} по сохранённым замерам
              </title>
              <desc>
                Пунктир отмечает момент сравнения. Разрывы означают отсутствие
                измерений. Выберите точку для подробностей.
              </desc>
              <rect
                x={graph.markerX}
                y="28"
                width={graph.right - graph.markerX}
                height="168"
                className={styles.chartAfter}
              />
              {[0, 0.5, 1].map((ratio) => (
                <g key={ratio}>
                  <line
                    x1={graph.left}
                    x2={graph.right}
                    y1={196 - ratio * 160}
                    y2={196 - ratio * 160}
                    className={styles.chartGrid}
                  />
                  <text
                    x={graph.left - 6}
                    y={200 - ratio * 160}
                    textAnchor="end"
                    className={styles.chartLabel}
                  >
                    {formatSearchMetric(graph.maximum * ratio, graph.unit)}
                  </text>
                </g>
              ))}
              <line
                x1={graph.markerX}
                x2={graph.markerX}
                y1="24"
                y2="204"
                className={styles.chartMarker}
              />
              <path d={graph.line} className={styles.chartLine} />
              {graph.points.map((point, index) =>
                point.y === null ? null : (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={trend.selected === index ? 6 : 4}
                    className={styles.chartPoint}
                    role="button"
                    tabIndex={0}
                    aria-label={
                      point.label +
                      ": " +
                      formatSearchMetric(point.value, graph.unit) +
                      ", запросов: " +
                      point.interval.metrics.count
                    }
                    aria-pressed={trend.selected === index}
                    onFocus={() => trend.setSelected(index)}
                    onMouseEnter={() => trend.setSelected(index)}
                    onClick={() => trend.setSelected(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        trend.setSelected(index);
                      }
                    }}
                  >
                    <title>
                      {point.label +
                        ": " +
                        formatSearchMetric(point.value, graph.unit)}
                    </title>
                  </circle>
                ),
              )}
              {graph.ticks.map((tick, index) => (
                <text
                  key={index}
                  x={tick.x}
                  y="228"
                  textAnchor={
                    index === 0
                      ? "start"
                      : index === graph.ticks.length - 1
                        ? "end"
                        : "middle"
                  }
                  className={styles.chartLabel}
                >
                  {tick.label}
                </text>
              ))}
            </svg>
          </div>
          <p className={styles.trendDetail}>
            {trend.point && trend.point.y !== null
              ? trend.point.label +
                " · " +
                formatSearchMetric(trend.point.value, graph.unit) +
                " · запросов: " +
                trend.point.interval.metrics.count
              : "Наведите на точку или выберите её клавишей Tab, чтобы увидеть измерения."}
          </p>
        </>
      ) : (
        <p role="status">
          Для этого показателя пока нет измерений. График появится после
          поисковых запросов.
        </p>
      )}
      <p className={styles.muted}>
        Пунктир — {formatSearchDate(analytics.splitAt)}. Справа — период после
        отметки. Время указано в вашем часовом поясе.
      </p>
    </section>
  );
}
