/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunsView.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт серверные параметры маршрутов реестра и карточки процесса.
 */

import type { AdminViewServerProps } from "payload";

export type WorkflowRunsViewProps = AdminViewServerProps & {
  runsRoute: `/${string}`;
  chatRoute: `/${string}`;
  settingsRoute: `/${string}`;
  mode: "list" | "detail";
};

export type WorkflowRunsViewData = {
  runsURL: string;
  chatURL: string;
  settingsURL: string;
  rootRunID?: string;
};
