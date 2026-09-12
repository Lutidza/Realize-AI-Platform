/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunsView.view.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Размещает реестр процессов в штатной оболочке Payload Admin.
 */

import { DefaultTemplate } from "@payloadcms/next/templates";
import { SetStepNav } from "@payloadcms/ui";
import { WorkflowRunsClient } from "./WorkflowRunsClient.component";
import type { WorkflowRunsViewProps } from "./WorkflowRunsView.types";
import { loadWorkflowRunsView } from "./loadWorkflowRunsView.service";

export const WorkflowRunsView = (props: WorkflowRunsViewProps) => {
  const data = loadWorkflowRunsView(props);
  const { locale, permissions, req, visibleEntities } = props.initPageResult;
  return (
    <DefaultTemplate
      {...props}
      i18n={req.i18n}
      locale={locale}
      permissions={permissions}
      req={req}
      user={req.user ?? undefined}
      viewType="realize-workflow-runs"
      visibleEntities={{
        collections: visibleEntities.collections,
        globals: visibleEntities.globals,
      }}
    >
      <SetStepNav
        nav={[
          {
            label: "Запуски процессов",
            ...(data.rootRunID ? { url: data.runsURL } : {}),
          },
          ...(data.rootRunID ? [{ label: "Карточка запуска" }] : []),
        ]}
      />
      <WorkflowRunsClient {...data} />
    </DefaultTemplate>
  );
};
