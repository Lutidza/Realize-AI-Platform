/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchQualityHistory.component.tsx
 * @version 1.0.0
 * @date 2026-09-30
 * @description Показывает правильность контрольных целей и сравнение задач только на одинаковом корпусе и фазе кеша.
 * @see documentation/architecture/repository-search.md
 */
import { UiInput, UiNotice } from "@realize/ui-kit";
import type { SearchQualityHistoryProps } from "./SearchObservations.types";
import { useSearchQualityImport } from "./useSearchQualityImport.hook";
import {
  formatSearchDate,
  formatSearchMetric,
  searchComparisonChange,
} from "./searchObservationAnalyticsPresentation.util";
import styles from "./SearchObservations.module.css";

export function SearchQualityHistoryPanel({
  quality,
  apiURL,
  onChange,
}: SearchQualityHistoryProps) {
  const importer = useSearchQualityImport(apiURL, onChange);
  return (
    <section
      aria-label="Качество контрольных задач"
      className={styles.analytics}
    >
      <h2>Контрольные задачи и версии</h2>
      <p className={styles.muted}>
        Правильность — доля заранее известных целей, найденных в нужном файле и
        строках. Время задачи и число вызовов включают все её шаги. Первый
        прогон и повторы учитываются отдельно; кеш ОС не сбрасывается. Хранятся
        последние 64 замера за 180 дней.
      </p>
      <label className={styles.metricSelector}>
        Импорт отчёта benchmark
        <UiInput
          type="file"
          accept="application/json,.json"
          disabled={importer.loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importer.importReport(file);
            event.target.value = "";
          }}
        />
      </label>
      {importer.loading ? (
        <p role="status">Импортируем контрольные замеры…</p>
      ) : null}
      {importer.status ? <p role="status">{importer.status}</p> : null}
      {importer.error ? (
        <UiNotice tone="danger" role="alert">
          {importer.error}
        </UiNotice>
      ) : null}
      {quality?.runs.length ? (
        <div
          className={styles.comparisonTable}
          tabIndex={0}
          role="region"
          aria-label="Контрольные замеры"
        >
          <table>
            <caption>Известные цели и стоимость поиска</caption>
            <thead>
              <tr>
                <th scope="col">Версия и корпус</th>
                <th scope="col">Потребитель / режим</th>
                <th scope="col">Прогон</th>
                <th scope="col">Правильность</th>
                <th scope="col">Время задачи / вызовы</th>
                <th scope="col">Файлы / чтение / ответ</th>
              </tr>
            </thead>
            <tbody>
              {quality.runs.map((run) => (
                <tr key={run.id}>
                  <th scope="row">
                    {run.release}
                    <small>
                      {run.corpus} · {formatSearchDate(run.observedAt)}
                    </small>
                    <details>
                      <summary>Версии источников</summary>
                      <p>
                        Корпус: <code>{run.corpusVersion}</code>
                      </p>
                      <p>
                        Поиск: <code>{run.sourceVersion}</code>
                      </p>
                    </details>
                  </th>
                  <td>
                    {run.consumer.toUpperCase()} / {run.mode}
                  </td>
                  <td>
                    {run.cache === "initial"
                      ? "Первый"
                      : `Повтор ${run.repeat}`}
                  </td>
                  <td>
                    {formatSearchMetric(
                      (100 * run.correctTargets) / run.targets,
                      "percent",
                    )}
                    <small>
                      {run.correctTargets} из {run.targets} целей
                    </small>
                  </td>
                  <td>
                    {formatSearchMetric(run.taskDurationMs, "ms")} / {run.calls}
                  </td>
                  <td>
                    {run.filesRead ?? "Не измерено"} /{" "}
                    {formatSearchMetric(run.bytesRead, "bytes")} /{" "}
                    {formatSearchMetric(run.outputBytes, "bytes")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="status">
          Контрольных замеров пока нет. Импортируйте отчёт с qualityRuns.
        </p>
      )}
      {quality?.comparisons.length ? (
        <div
          className={styles.comparisonTable}
          tabIndex={0}
          role="region"
          aria-label="Сравнение контрольных версий"
        >
          <table>
            <caption>
              Изменения на одинаковом корпусе, потребителе и прогоне
            </caption>
            <thead>
              <tr>
                <th scope="col">До → после</th>
                <th scope="col">Правильность</th>
                <th scope="col">Сокращение времени</th>
                <th scope="col">Сокращение вызовов</th>
                <th scope="col">Сокращение чтения</th>
              </tr>
            </thead>
            <tbody>
              {quality.comparisons.map((change) => (
                <tr key={change.after.id}>
                  <th scope="row">
                    {change.before.release} / {change.before.mode} →{" "}
                    {change.after.release} / {change.after.mode}
                    <small>
                      {change.after.consumer.toUpperCase()} ·{" "}
                      {change.after.corpus} ·{" "}
                      {change.after.cache === "initial"
                        ? "первый"
                        : `повтор ${change.after.repeat}`}
                    </small>
                  </th>
                  <td>
                    {searchComparisonChange(change.accuracyChangePoints, true)}
                  </td>
                  <td>
                    {searchComparisonChange(change.taskTimeReductionPercent)}
                  </td>
                  <td>{searchComparisonChange(change.callReductionPercent)}</td>
                  <td>{searchComparisonChange(change.readReductionPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.muted}>
          Для сравнения нужны две версии с одинаковым hash корпуса, потребителем
          и фазой кеша. Положительное сокращение означает экономию;
          отрицательное — рост затрат.
        </p>
      )}
    </section>
  );
}
