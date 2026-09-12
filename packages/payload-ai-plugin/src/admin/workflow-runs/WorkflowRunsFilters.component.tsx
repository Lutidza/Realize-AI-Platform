/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunsFilters.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Применяет фильтры реестра одним серверным запросом со сбросом страницы.
 */

"use client";

import { useState } from "react";
import { UiButton, UiInput, UiSelect, UiNotice } from "@realize/ui-kit";
import { Search } from "lucide-react";
import type {
  WorkflowRunsFiltersProps,
  WorkflowRunsFilterValues,
} from "./WorkflowRuns.types";
import { WorkflowRunFilterOption } from "./WorkflowRunFilterOption.component";
import { workflowStatusLabels } from "./workflowRunsPresentation.config";
import {
  workflowRunsFilterValues,
  workflowRunsFilterQuery,
} from "./workflowRunsFilters.util";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunsFilters = ({
  query,
  onApply,
}: WorkflowRunsFiltersProps) => {
  const [values, setValues] = useState(() => workflowRunsFilterValues(query));
  const [error, setError] = useState<string>();
  const change = <K extends keyof WorkflowRunsFilterValues>(
    key: K,
    value: WorkflowRunsFilterValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <form
      className={styles.filters}
      aria-label="Фильтры запусков"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onApply(workflowRunsFilterQuery(values));
          setError(undefined);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Проверьте даты.");
        }
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
              change(
                "status",
                event.target.value as WorkflowRunsFilterValues["status"],
              )
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
        <label className={styles.field}>
          <span>Начало с, UTC</span>
          <UiInput
            type="date"
            value={values.createdFrom}
            onChange={(event) => change("createdFrom", event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Начало по, UTC</span>
          <UiInput
            type="date"
            value={values.createdThrough}
            onChange={(event) => change("createdThrough", event.target.value)}
          />
        </label>
      </div>
      <div className={styles.resultBar}>
        <p className={styles.muted}>
          Даты включают весь выбранный день. Исторические процессы и профили
          доступны в поиске.
        </p>
        <div className={styles.inline}>
          <UiButton
            variant="ghost"
            onClick={() => {
              setValues(workflowRunsFilterValues({ page: 1, pageSize: 25 }));
              onApply({ page: 1, pageSize: 25 });
            }}
          >
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
