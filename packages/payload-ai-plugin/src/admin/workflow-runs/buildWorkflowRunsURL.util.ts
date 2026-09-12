/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/buildWorkflowRunsURL.util.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Сохраняет только разрешённые фильтры реестра при переходе в карточку и назад.
 */

import type { WorkflowRunListQuery } from "@realize/ai-contracts";

export const workflowRunsSearch = (query: WorkflowRunListQuery) => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  for (const key of [
    "query",
    "workflowKey",
    "profileKey",
    "status",
    "createdFrom",
    "createdTo",
  ] as const)
    if (query[key]) params.set(key, query[key]);
  return params.toString();
};

/** runsURL уже учитывает routes.admin; идентификатор не может изменить pathname. */
export const buildWorkflowRunsURL = (
  runsURL: string,
  query: WorkflowRunListQuery,
  rootRunID?: string,
) =>
  `${runsURL}${rootRunID ? `/${encodeURIComponent(rootRunID)}` : ""}?${workflowRunsSearch(query)}`;
