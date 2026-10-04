/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationAnalytics.component.tsx
 * @version 1.1.0
 * @date 2026-09-30
 * @description Показывает скорость, полноту выполнения и сравнение равных периодов вокруг оптимизации.
 * @see documentation/architecture/repository-search.md
 */
import { UiNotice } from "@realize/ui-kit";
import type { SearchObservationAnalyticsProps } from "./SearchObservations.types";
import { SearchObservationTrend } from "./SearchObservationTrend.component";
import {
  formatSearchDate,
  formatSearchMetric,
  searchComparisonChange,
} from "./searchObservationAnalyticsPresentation.util";
import styles from "./SearchObservations.module.css";

export function SearchObservationAnalytics({
  analytics,
  retentionDays,
}: SearchObservationAnalyticsProps) {
  const { summary, comparison } = analytics;
  const before = comparison.before.metrics;
  const after = comparison.after.metrics;
  return (
    <section
      aria-label="Аналитика эффективности поиска"
      className={styles.analytics}
    >
      <h2>Скорость и полнота выполнения</h2>
      <dl className={styles.summary}>
        <div>
          <dt>Среднее время поиска</dt>
          <dd>{formatSearchMetric(summary.averageMs, "ms")}</dd>
          <small>
            {summary.count.toLocaleString("ru-RU")} запросов за период
          </small>
        </div>
        <div>
          <dt>Полнота выполнения</dt>
          <dd>{formatSearchMetric(summary.completePercent, "percent")}</dd>
          <small>
            Полностью выполнено: {summary.complete} из {summary.count}
          </small>
        </div>
        <div>
          <dt>p95 времени поиска</dt>
          <dd>{formatSearchMetric(summary.p95Ms, "ms")}</dd>
          <small>95 % запросов выполнялись не дольше</small>
        </div>
        <div>
          <dt>Средний объём чтения</dt>
          <dd>{formatSearchMetric(summary.averageBytesRead, "bytes")}</dd>
          <small>
            Измерено в {summary.measuredReads} из {summary.count} запросов
          </small>
        </div>
      </dl>
      <p className={styles.muted}>
        Полнота выполнения — доля запросов, завершённых без ошибки, отмены и
        неполного покрытия. Полный поиск без совпадений тоже считается
        завершённым. Это не оценка релевантности кода. Ошибок: {summary.errors};
        неполных: {summary.partial}; отмен: {summary.cancelled}; без совпадений:{" "}
        {summary.empty}. Средний ответ:{" "}
        {formatSearchMetric(summary.averageOutputBytes, "bytes")}.
      </p>
      <SearchObservationTrend analytics={analytics} />
      <section aria-label="Сравнение до и после" className={styles.comparison}>
        <h3>До и после изменения</h3>
        <p className={styles.muted}>
          Равные окна: {formatSearchDate(comparison.before.from)} —{" "}
          {formatSearchDate(comparison.before.to)}
          {" и "}
          {formatSearchDate(comparison.after.from)} —{" "}
          {formatSearchDate(comparison.after.to)}.
        </p>
        <div
          className={styles.comparisonTable}
          tabIndex={0}
          role="region"
          aria-label="Показатели до и после"
        >
          <table>
            <caption>Сравнение сохранённых замеров</caption>
            <thead>
              <tr>
                <th scope="col">Показатель</th>
                <th scope="col">До</th>
                <th scope="col">После</th>
                <th scope="col">Изменение</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Запросов</th>
                <td>{before.count}</td>
                <td>{after.count}</td>
                <td>Размер выборки</td>
              </tr>
              <tr>
                <th scope="row">Среднее время</th>
                <td>{formatSearchMetric(before.averageMs, "ms")}</td>
                <td>{formatSearchMetric(after.averageMs, "ms")}</td>
                <td>
                  {searchComparisonChange(comparison.speedImprovementPercent)}
                  <small>сокращения времени</small>
                </td>
              </tr>
              <tr>
                <th scope="row">Полнота выполнения</th>
                <td>{formatSearchMetric(before.completePercent, "percent")}</td>
                <td>{formatSearchMetric(after.completePercent, "percent")}</td>
                <td>
                  {searchComparisonChange(
                    comparison.completeChangePoints,
                    true,
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Среднее чтение</th>
                <td>{formatSearchMetric(before.averageBytesRead, "bytes")}</td>
                <td>{formatSearchMetric(after.averageBytesRead, "bytes")}</td>
                <td>
                  {searchComparisonChange(comparison.readReductionPercent)}
                  <small>экономии чтения</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {comparison.unavailableReason ? (
          <UiNotice>
            {comparison.unavailableReason === "history_limited"
              ? "Часть окна до изменения уже вне доступной истории. Процент улучшения не рассчитывается."
              : "Для сравнения нужны сохранённые запросы и до, и после отметки."}
          </UiNotice>
        ) : null}
        <p className={styles.muted}>
          Сравнивайте одинаковые источники и операции. Состав запросов, нагрузка
          и кеш также влияют на время. Показатели рассчитаны по сохранённым
          событиям: срок хранения — {retentionDays} дней; очистка, предел
          записей и потери доставки сокращают выборку.
        </p>
      </section>
    </section>
  );
}
