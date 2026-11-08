/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunsFilters.component.tsx
 * @version 1.1.0
 * @date 2026-11-03
 * @description Применяет фильтры реестра одним серверным запросом со сбросом страницы.
 */

"use client";

import {
  UiButton,
  UiInput,
  UiSelect,
  UiNotice,
  UiDatePicker,
  parseUiCalendarDate,
} from "@realize/ui-kit";
import { Search } from "lucide-react";
import type { WorkflowRunsFiltersProps } from "./WorkflowRuns.types";
import { WorkflowRunFilterOption } from "./WorkflowRunFilterOption.component";
import { workflowStatusLabels } from "./workflowRunsPresentation.config";
import { useWorkflowRunsFilters } from "./useWorkflowRunsFilters.hook";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunsFilters = ({
  query,
  onApply,
}: WorkflowRunsFiltersProps) => {
  const { values, change, changeDates, error, apply, reset, resetKey } =
    useWorkflowRunsFilters({ query, onApply });
  return (
    <form
      className={styles.filters}
      aria-label="Фильтры запусков"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <label className={`${styles.field} ${styles.searchField}`}>
        <span>Поиск</span>
        <UiInput
          type="search"
          placeholder="Процесс, профиль или идентификатор запуска"
          maxLength={200}
          value={values.query}
          onChange={(event) => change("query", event.target.value)}
        />
      </label>
      <div className={styles.filterGrid}>
        <WorkflowRunFilterOption
          kind="workflow"
          value={values.workflowKey}
          onChange={(value) => change("workflowKey", value)}
        />
        <WorkflowRunFilterOption
          kind="profile"
          value={values.profileKey}
          onChange={(value) => change("profileKey", value)}
        />
        <label className={styles.field}>
          <span>Состояние</span>
          <UiSelect
            value={values.status}
            onChange={(event) =>
              change("status", event.target.value as typeof values.status)
            }
          >
            <option value="">Все состояния</option>
            {Object.entries(workflowStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </UiSelect>
        </label>
        <UiDatePicker
          label="Даты запуска, UTC"
          mode="range"
          startLabel="Начало с, UTC"
          endLabel="Начало по, UTC"
          value={[
            parseUiCalendarDate(values.createdFrom),
            parseUiCalendarDate(values.createdThrough),
          ]}
          onChange={changeDates}
          key={resetKey}
        />
      </div>
      <div className={styles.resultBar}>
        <p className={styles.muted}>
          Даты включают весь выбранный день. Исторические процессы и профили
          доступны в поиске.
        </p>
        <div className={styles.inline}>
          <UiButton variant="ghost" type="button" onClick={reset}>
            Сбросить
          </UiButton>
          <UiButton type="submit">
            <Search size={15} aria-hidden="true" />
            Найти
          </UiButton>
        </div>
      </div>
      {error ? (
        <UiNotice tone="danger" role="alert">
          {error}
        </UiNotice>
      ) : null}
    </form>
  );
};
