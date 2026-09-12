/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRuns.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Определяет форму фильтров и свойства представлений реестра процессов.
 */

import type {
  WorkflowRegistryStatus,
  WorkflowRunListDTO,
  WorkflowRunListQuery,
} from "@realize/ai-contracts";
import type { useWorkflowRunDetail } from "./useWorkflowRunDetail.hook";

export type WorkflowRunsFilterValues = {
  query: string;
  workflowKey: string;
  profileKey: string;
  status: WorkflowRegistryStatus | "";
  createdFrom: string;
  createdThrough: string;
};
export type WorkflowRunsFiltersProps = {
  query: WorkflowRunListQuery;
  onApply: (query: WorkflowRunListQuery) => void;
};
export type WorkflowRunsTableProps = {
  data: WorkflowRunListDTO;
  runsURL: string;
  query: WorkflowRunListQuery;
  loading: boolean;
  onPage: (page: number) => void;
};
export type WorkflowRunDetailController = ReturnType<
  typeof useWorkflowRunDetail
>;

export type WorkflowRunDetailProps = {
  rootRunID: string;
  backURL: string;
  chatURL: string;
  settingsURL: string;
};
export type WorkflowRunFilterOptionProps = {
  kind: "workflow" | "profile";
  value: string;
  onChange: (key: string) => void;
};
export type WorkflowRunActionsProps = {
  controller: WorkflowRunDetailController;
};
export type WorkflowRunContentProps = {
  detail: import("@realize/ai-contracts").WorkflowRunDetailDTO;
};
