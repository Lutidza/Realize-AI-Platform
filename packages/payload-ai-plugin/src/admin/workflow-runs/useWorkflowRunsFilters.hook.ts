/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/useWorkflowRunsFilters.hook.ts
 * @version 1.0.0
 * @date 2026-11-03
 * @description Ведёт черновик фильтров запусков и переиспользует mapper включённых UTC-дней.
 */
"use client";
import { useState } from "react";
import { formatUiCalendarDate, type UiDateRange } from "@realize/ui-kit";
import type {
  WorkflowRunsFiltersProps,
  WorkflowRunsFilterValues,
} from "./WorkflowRuns.types";
import {
  workflowRunsFilterValues,
  workflowRunsFilterQuery,
} from "./workflowRunsFilters.util";

export function useWorkflowRunsFilters({
  query,
  onApply,
}: WorkflowRunsFiltersProps) {
  const [values, setValues] = useState(() => workflowRunsFilterValues(query));
  const [error, setError] = useState<string>();
  const [resetKey, setResetKey] = useState(0);
  return {
    values,
    error,
    resetKey,
    change: <K extends keyof WorkflowRunsFilterValues>(
      key: K,
      value: WorkflowRunsFilterValues[K],
    ) => setValues((current) => ({ ...current, [key]: value })),
    changeDates: ([from, through]: UiDateRange) =>
      setValues((current) => ({
        ...current,
        createdFrom: formatUiCalendarDate(from),
        createdThrough: formatUiCalendarDate(through),
      })),
    apply: () => {
      try {
        onApply(workflowRunsFilterQuery(values));
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Проверьте даты.");
      }
    },
    reset: () => {
      setValues(workflowRunsFilterValues({ page: 1, pageSize: 25 }));
      setError(undefined);
      setResetKey((value) => value + 1);
      onApply({ page: 1, pageSize: 25 });
    },
  };
}
