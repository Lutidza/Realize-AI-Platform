/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchAggregateHistory.component.tsx
 * @version 1.0.0
 * @date 2026-09-30
 * @description Показывает дневные агрегаты всех consumers после удаления raw событий без выдуманного p95.
 * @see documentation/architecture/repository-search.md
 */
import type { SearchAggregateHistoryProps } from "./SearchObservations.types";
import {
  formatSearchDate,
  formatSearchMetric,
} from "./searchObservationAnalyticsPresentation.util";
import styles from "./SearchObservations.module.css";
export function SearchAggregateHistoryPanel({
  history,
}: SearchAggregateHistoryProps) {
  return (
    <section
      aria-label="Длительная история поиска"
      className={styles.analytics}
    >
      <h2>Дневная история за 180 дней</h2>
      <p className={styles.muted}>
        Общий итог всех потребителей сохраняется после автоматического удаления
        сырых событий. Фильтры выше относятся к сырым событиям. Доступная
        история:{" "}
        {history?.availableFrom
          ? formatSearchDate(history.availableFrom)
          : "замеров пока нет"}
        . Точный p95 в дневных агрегатах не сохраняется.
      </p>
      {history?.series.length ? (
        <details>
          <summary>Дневные показатели ({history.series.length})</summary>
          <div
            className={styles.comparisonTable}
            tabIndex={0}
            role="region"
            aria-label="Дневные агрегаты"
          >
            <table>
              <caption>Обезличенные показатели по дням UTC</caption>
              <thead>
                <tr>
                  <th scope="col">Дата UTC</th>
                  <th scope="col">Запросов</th>
                  <th scope="col">Полнота выполнения</th>
                  <th scope="col">Ошибки / неполные / отмены</th>
                  <th scope="col">Среднее время</th>
                  <th scope="col">Среднее чтение / ответ</th>
                </tr>
              </thead>
              <tbody>
                {[...history.series].reverse().map((day) => (
                  <tr key={day.from}>
                    <th scope="row">{day.from.slice(0, 10)}</th>
                    <td>{day.metrics.count}</td>
                    <td>
                      {formatSearchMetric(
                        day.metrics.completePercent,
                        "percent",
                      )}
                    </td>
                    <td>
                      {day.metrics.errors} / {day.metrics.partial} /{" "}
                      {day.metrics.cancelled}
                    </td>
                    <td>{formatSearchMetric(day.metrics.averageMs, "ms")}</td>
                    <td>
                      {formatSearchMetric(
                        day.metrics.averageBytesRead,
                        "bytes",
                      )}{" "}
                      /{" "}
                      {formatSearchMetric(
                        day.metrics.averageOutputBytes,
                        "bytes",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : (
        <p role="status">
          Дневные агрегаты появятся после поступления замеров.
        </p>
      )}
    </section>
  );
}
