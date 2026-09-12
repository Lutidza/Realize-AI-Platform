/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCatalog.component.tsx
 * @version 1.2.0
 * @date 2026-09-10
 * @description Показывает общий каталог записей с управляемыми фильтрами и навигацией.
 */

import {
  UiBadge,
  UiButton,
  UiInput,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import { ArrowLeft, ArrowRight, SearchX } from "lucide-react";
import type {
  AgentLayerCatalogProps,
  AgentLayerCatalogState,
} from "./AgentLayerCatalog.types";
import { AgentLayerCatalogCreation } from "./AgentLayerCatalogCreation.component";
import {
  AGENT_LAYER_CREATION_HINTS,
  AGENT_LAYER_EDITABLE_KINDS,
} from "./agentLayerEditableKinds.config";
import { AGENT_LAYER_KIND_LABELS } from "./agentLayerPresentation.util";
import { selectAgentLayerCatalog } from "./selectAgentLayerCatalog.util";
import styles from "./AgentLayerCatalog.module.css";

/** Один каталог обслуживает все виды; состояние и открытие записи принадлежат оболочке. */
export const AgentLayerCatalog = ({
  artifacts,
  kind,
  state,
  onStateChange,
  onOpen,
  onCreate,
  disabled,
  title,
  description,
}: AgentLayerCatalogProps) => {
  const selection = selectAgentLayerCatalog(artifacts, state, kind);
  const editableKind = AGENT_LAYER_EDITABLE_KINDS.find(
    (candidate) => candidate === kind,
  );
  const changeFilter = (change: Partial<AgentLayerCatalogState>) =>
    onStateChange({ ...state, ...change, page: 1 });
  const clearFilters = () =>
    changeFilter({ search: "", status: "all", usage: "all" });

  return (
    <UiSurface appearance="flush" className={styles.catalog}>
      <div className={styles.heading}>
        <div className={styles.headingText}>
          <div className={styles.title}>
            <h2>{title}</h2>
            <UiBadge>{selection.totalCount}</UiBadge>
          </div>
          <p className={styles.muted}>{description}</p>
        </div>
        {onCreate && (
          <AgentLayerCatalogCreation
            kind={kind}
            onCreate={onCreate}
            disabled={disabled}
            isAtLimit={artifacts.length >= 512}
          />
        )}
      </div>

      <div className={styles.filters}>
        <UiInput
          aria-label={`Поиск: ${title}`}
          type="search"
          placeholder="Поиск по названию, ключу или содержимому"
          value={state.search}
          onChange={(event) => changeFilter({ search: event.target.value })}
          disabled={disabled}
        />
        <div className={styles.filterOptions}>
          <label className={styles.field}>
            Статус
            <UiSelect
              value={state.status}
              onChange={(event) =>
                changeFilter({
                  status: event.target
                    .value as AgentLayerCatalogState["status"],
                })
              }
              disabled={disabled}
            >
              <option value="all">Все статусы</option>
              <option value="enabled">Включённые</option>
              <option value="disabled">Выключенные</option>
            </UiSelect>
          </label>
          <label className={styles.field}>
            Использование
            <UiSelect
              value={state.usage}
              onChange={(event) =>
                changeFilter({
                  usage: event.target.value as AgentLayerCatalogState["usage"],
                })
              }
              disabled={disabled}
            >
              <option value="all">Все записи</option>
              <option value="used">Есть ссылки</option>
              <option value="unused">Нет ссылок</option>
            </UiSelect>
          </label>
          <label className={styles.field}>
            Сортировка
            <UiSelect
              value={state.sort}
              onChange={(event) =>
                changeFilter({
                  sort: event.target.value as AgentLayerCatalogState["sort"],
                })
              }
              disabled={disabled}
            >
              <option value="title">По названию</option>
              <option value="revision">По ревизии ↓</option>
              <option value="usage">По использованию ↓</option>
            </UiSelect>
          </label>
        </div>
      </div>

      <div className={styles.resultBar}>
        <p className={styles.muted} role="status" aria-atomic="true">
          {selection.hasFilters
            ? `Найдено: ${selection.filteredCount} из ${selection.totalCount}`
            : `Всего записей: ${selection.totalCount}`}
        </p>
        {selection.hasFilters && (
          <UiButton
            variant="ghost"
            size="small"
            onClick={clearFilters}
            disabled={disabled}
          >
            Сбросить фильтры
          </UiButton>
        )}
        {selection.rows.length > 0 && (
          <nav className={styles.pageControls} aria-label="Страницы каталога">
            <UiButton
              variant="ghost"
              size="icon"
              aria-label="Предыдущая страница"
              disabled={disabled || selection.page === 1}
              onClick={() =>
                onStateChange({ ...state, page: selection.page - 1 })
              }
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </UiButton>
            <span
              className={styles.pageNumber}
              aria-live="polite"
              aria-atomic="true"
            >
              {selection.page} / {selection.pageCount}
            </span>
            <UiButton
              variant="ghost"
              size="icon"
              aria-label="Следующая страница"
              disabled={disabled || selection.page === selection.pageCount}
              onClick={() =>
                onStateChange({ ...state, page: selection.page + 1 })
              }
            >
              <ArrowRight size={16} aria-hidden="true" />
            </UiButton>
          </nav>
        )}
      </div>

      {selection.rows.length ? (
        <>
          <div
            key={JSON.stringify([
              selection.page,
              state.search,
              state.status,
              state.usage,
              state.sort,
            ])}
            className={styles.tableViewport}
            role="region"
            aria-label={`Записи каталога: ${title}`}
            tabIndex={0}
          >
            <table className={styles.table} aria-label={title}>
              <thead>
                <tr>
                  <th scope="col">Запись</th>
                  <th scope="col" className={styles.statusColumn}>
                    Статус
                  </th>
                  <th scope="col" className={styles.usageColumn}>
                    Ссылки на запись
                  </th>
                  <th scope="col" className={styles.revisionColumn}>
                    Ревизия
                  </th>
                </tr>
              </thead>
              <tbody>
                {selection.rows.map(({ artifact, summary, usageCount }) => (
                  <tr key={`${artifact.kind}:${artifact.key}`}>
                    <td className={styles.recordCell}>
                      <UiButton
                        variant="ghost"
                        className={styles.recordButton}
                        onClick={() => onOpen(artifact)}
                        disabled={disabled}
                        aria-label={`Открыть ${artifact.title || artifact.key}`}
                      >
                        <span className={styles.recordTitle}>
                          {artifact.title || artifact.key}
                        </span>
                        <span className={styles.key}>{artifact.key}</span>
                        {summary && (
                          <span className={styles.summary}>{summary}</span>
                        )}
                      </UiButton>
                      {!kind && (
                        <span className={styles.kind}>
                          {AGENT_LAYER_KIND_LABELS[artifact.kind]}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={styles.mobileLabel}>Статус</span>
                      <UiBadge tone={artifact.enabled ? "positive" : "neutral"}>
                        {artifact.enabled ? "Включено" : "Выключено"}
                      </UiBadge>
                    </td>
                    <td>
                      <span className={styles.mobileLabel}>
                        Ссылки на запись
                      </span>
                      {usageCount ? (
                        <UiButton
                          variant="ghost"
                          size="small"
                          onClick={() => onOpen(artifact)}
                          disabled={disabled}
                          aria-label={`Открыть связи: ${artifact.title || artifact.key}`}
                        >
                          {usageCount}
                          <ArrowRight size={13} aria-hidden="true" />
                        </UiButton>
                      ) : (
                        <span className={styles.muted}>Нет ссылок</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.mobileLabel}>Ревизия</span>
                      <span className={styles.revision}>
                        {artifact.revision}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <SearchX size={28} aria-hidden="true" />
          <h3>
            {selection.hasFilters
              ? "Записи не найдены"
              : "В этом разделе пока нет записей"}
          </h3>
          <p className={styles.muted}>
            {selection.hasFilters
              ? "Измените запрос или сбросьте фильтры, чтобы увидеть остальные записи."
              : onCreate && !kind
                ? "Выберите тип новой записи и нажмите «Создать запись», чтобы заполнить её форму."
                : onCreate && editableKind
                  ? AGENT_LAYER_CREATION_HINTS[editableKind]
                  : "Выберите другую версию или раздел. Здесь появятся записи выбранной конфигурации."}
          </p>
          {selection.hasFilters && (
            <UiButton
              variant="secondary"
              onClick={clearFilters}
              disabled={disabled}
            >
              Сбросить фильтры
            </UiButton>
          )}
        </div>
      )}
    </UiSurface>
  );
};
