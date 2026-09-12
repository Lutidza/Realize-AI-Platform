/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/workflowRunsFilters.util.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Преобразует включённые UTC-дни формы в строгие границы API-фильтра.
 */

import type { WorkflowRunListQuery } from "@realize/ai-contracts";
import type { WorkflowRunsFilterValues } from "./WorkflowRuns.types";

export const workflowRunsFilterValues = (
  query: WorkflowRunListQuery,
): WorkflowRunsFilterValues => ({
  query: query.query ?? "",
  workflowKey: query.workflowKey ?? "",
  profileKey: query.profileKey ?? "",
  status: query.status ?? "",
  createdFrom: query.createdFrom?.slice(0, 10) ?? "",
  createdThrough: query.createdTo
    ? new Date(Date.parse(query.createdTo) - 86_400_000)
        .toISOString()
        .slice(0, 10)
    : "",
});

export const workflowRunsFilterQuery = (
  values: WorkflowRunsFilterValues,
): WorkflowRunListQuery => {
  const createdFrom = values.createdFrom
    ? new Date(`${values.createdFrom}T00:00:00.000Z`).toISOString()
    : undefined;
  const createdTo = values.createdThrough
    ? new Date(
        Date.parse(`${values.createdThrough}T00:00:00.000Z`) + 86_400_000,
      ).toISOString()
    : undefined;
  if (createdFrom && createdTo && createdFrom >= createdTo)
    throw new Error("Конечная дата должна быть не раньше начальной.");
  return {
    page: 1,
    pageSize: 25,
    ...(values.query.trim() ? { query: values.query.trim() } : {}),
    ...(values.workflowKey ? { workflowKey: values.workflowKey } : {}),
    ...(values.profileKey ? { profileKey: values.profileKey } : {}),
    ...(values.status ? { status: values.status } : {}),
    ...(createdFrom ? { createdFrom } : {}),
    ...(createdTo ? { createdTo } : {}),
  };
};
