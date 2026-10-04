/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationsClient.component.tsx
 * @version 1.4.0
 * @date 2026-09-30
 * @description Показывает автоматически поступающие замеры, фильтры и действующие пределы поиска.
 */
"use client";
import {
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import { AdminUiTheme } from "../AdminUiTheme.component";
import type { SearchObservationsClientProps } from "./SearchObservations.types";
import { useSearchObservations } from "./useSearchObservations.hook";
import { SearchObservationDetails } from "./SearchObservationDetails.component";
import { SearchObservationManagement } from "./SearchObservationManagement.component";
import { SearchObservationAnalytics } from "./SearchObservationAnalytics.component";
import { SearchQualityHistoryPanel } from "./SearchQualityHistory.component";
import { SearchAggregateHistoryPanel } from "./SearchAggregateHistory.component";
import {
  searchOutcomeLabels,
  searchOperationLabels,
  searchConsumerLabels,
} from "./searchObservationPresentation.config";
import styles from "./SearchObservations.module.css";

export function SearchObservationsClient({
  apiURL,
}: SearchObservationsClientProps) {
  const history = useSearchObservations(apiURL);
  const data = history.data;
  return (
    <AdminUiTheme>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1>Диагностика поиска</h1>
            <p>
              Скорость, полнота выдачи и фактические ограничения запросов
              агентов
            </p>
          </div>
          <UiButton
            variant="secondary"
            disabled={history.loading}
            onClick={history.refresh}
          >
            Обновить
          </UiButton>
        </header>
        <UiNotice>
          Замеры поиска чата Admin, исполнителя, reviewer, agent-search и
          managed MCP поступают автоматически. Тексты запросов, пути и найденный
          код не сохраняются. Прямые вызовы rg и другие внешние инструменты в
          эту историю не попадают.
        </UiNotice>
        <p className={styles.muted}>
          {history.hasPrevious
            ? "Просмотр истории. Нажмите «Обновить», чтобы вернуться к новым событиям."
            : "Автообновление каждые 2 секунды."}
          {history.updatedAt
            ? ` Обновлено в ${new Date(history.updatedAt).toLocaleTimeString("ru-RU")}.`
            : ""}
        </p>
        <UiSurface className={styles.surface}>
          <div className={styles.filters}>
            <label>
              Источник
              <UiSelect
                value={history.filters.source}
                onChange={(event) =>
                  history.filter("source", event.target.value)
                }
              >
                <option value="">Все источники</option>
                <option value="mcp">MCP</option>
                <option value="cli">CLI</option>
              </UiSelect>
            </label>
            <label>
              Потребитель
              <UiSelect
                value={history.filters.consumer}
                onChange={(event) =>
                  history.filter("consumer", event.target.value)
                }
              >
                <option value="">Все потребители</option>
                {Object.entries(searchConsumerLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </UiSelect>
            </label>
            <label>
              Операция
              <UiSelect
                value={history.filters.operation}
                onChange={(event) =>
                  history.filter("operation", event.target.value)
                }
              >
                <option value="">Все операции</option>
                {Object.entries(searchOperationLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </UiSelect>
            </label>
            <label>
              Период
              <UiSelect
                value={history.filters.hours}
                onChange={(event) =>
                  history.filter("hours", event.target.value)
                }
              >
                <option value="1">Последний час</option>
                <option value="24">24 часа</option>
                <option value="168">7 дней</option>
              </UiSelect>
            </label>
          </div>
          <form
            className={styles.comparisonControls}
            onSubmit={(event) => {
              event.preventDefault();
              history.applyComparison();
            }}
          >
            <label>
              Дата и время оптимизации
              <UiInput
                type="datetime-local"
                value={history.comparisonDraft}
                onChange={(event) =>
                  history.setComparisonDraft(event.target.value)
                }
                aria-invalid={Boolean(history.comparisonError)}
                aria-describedby="search-comparison-help"
              />
            </label>
            <UiButton type="submit" variant="secondary">
              Сравнить до и после
            </UiButton>
            <UiButton
              type="button"
              variant="secondary"
              onClick={history.clearComparison}
              disabled={!history.filters.compareAt && !history.comparisonDraft}
            >
              Сбросить дату
            </UiButton>
          </form>
          <p id="search-comparison-help" className={styles.muted}>
            Без даты сравниваются первая и вторая половины периода. С датой —
            равные окна до и после неё.
          </p>
          {history.comparisonError ? (
            <UiNotice tone="danger" role="alert">
              {history.comparisonError}
            </UiNotice>
          ) : null}
          {history.error ? (
            <UiNotice tone="danger" role="alert">
              {history.error}
            </UiNotice>
          ) : null}
          {history.loading ? <p role="status">Загружаем диагностику…</p> : null}
          {data ? (
            <SearchObservationAnalytics
              analytics={data.analytics}
              retentionDays={data.policy.retentionDays}
            />
          ) : null}
          <SearchQualityHistoryPanel
            quality={data?.analytics.quality}
            apiURL={apiURL}
            onChange={history.refresh}
          />
          {data ? (
            <>
              <SearchAggregateHistoryPanel history={data.analytics.history} />
              <h2 className={styles.historyHeading}>История запросов</h2>
              <div className={styles.filters}>
                <label>
                  Результат
                  <UiSelect
                    value={history.filters.outcome}
                    onChange={(event) =>
                      history.filter("outcome", event.target.value)
                    }
                  >
                    <option value="">Все результаты</option>
                    {Object.entries(searchOutcomeLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </UiSelect>
                </label>
                <label>
                  Длительность
                  <UiSelect
                    value={history.filters.slow}
                    onChange={(event) =>
                      history.filter("slow", event.target.value)
                    }
                  >
                    <option value="">Все запросы</option>
                    <option value="true">От 1 секунды</option>
                  </UiSelect>
                </label>
              </div>
              <dl className={styles.summary}>
                <div>
                  <dt>Запросов за период</dt>
                  <dd>{data.summary.count}</dd>
                </div>
                <div>
                  <dt>Ошибок</dt>
                  <dd>{data.summary.errors}</dd>
                </div>
                <div>
                  <dt>Неполная выдача</dt>
                  <dd>{data.summary.partial}</dd>
                </div>
                <div>
                  <dt>Среднее / p95</dt>
                  <dd>
                    {data.summary.averageMs === null
                      ? "Нет измерений"
                      : `${Math.round(data.summary.averageMs)} / ${Math.round(data.summary.p95Ms!)} мс`}
                  </dd>
                </div>
              </dl>
              <p className={styles.muted}>
                Фильтры результата и длительности применяются только к истории и
                её сводке. График и полнота выполнения учитывают все исходы. При
                потере отдельных замеров число событий может быть меньше числа
                вызовов. Хранение: {data.policy.retentionDays} дней, максимум{" "}
                {data.policy.capacity.toLocaleString("ru-RU")} событий; очередь
                runtime: {data.policy.queueCapacity}. При переполнении метрики
                пропускаются, поиск продолжается.
              </p>
              <section aria-label="История поиска" className={styles.history}>
                {data.items.length ? (
                  data.items.map((item) => (
                    <SearchObservationDetails key={item.id} item={item} />
                  ))
                ) : (
                  <p role="status">
                    За выбранный период запросов нет. При поиске через
                    agent-search или managed MCP события появятся здесь
                    автоматически.
                  </p>
                )}
              </section>
              <nav aria-label="Страницы истории" className={styles.actions}>
                <UiButton
                  variant="secondary"
                  disabled={!history.hasPrevious}
                  onClick={history.previous}
                >
                  Новее
                </UiButton>
                <UiButton
                  variant="secondary"
                  disabled={!data.next}
                  onClick={history.next}
                >
                  Старее
                </UiButton>
              </nav>
            </>
          ) : null}
        </UiSurface>
        <SearchObservationManagement
          apiURL={apiURL}
          onChange={history.refresh}
        />
      </main>
    </AdminUiTheme>
  );
}
