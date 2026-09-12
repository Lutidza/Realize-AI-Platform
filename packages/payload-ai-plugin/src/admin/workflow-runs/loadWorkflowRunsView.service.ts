/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/loadWorkflowRunsView.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет Admin-доступ и формирует маршруты без конфиденциальных данных.
 */

import { notFound, redirect } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";
import type {
  WorkflowRunsViewData,
  WorkflowRunsViewProps,
} from "./WorkflowRunsView.types";

/** История остаётся доступной при отключённом runtime; действия проверяет сервер. */
export const loadWorkflowRunsView = (
  props: WorkflowRunsViewProps,
): WorkflowRunsViewData => {
  const user = props.initPageResult.req.user as { roles?: string[] } | null;
  const adminRoute = props.payload.config.routes.admin;
  if (!user)
    redirect(
      formatAdminURL({
        adminRoute,
        path: props.payload.config.admin.routes.login,
      }),
    );
  if (!user.roles?.includes("admin"))
    redirect(
      formatAdminURL({
        adminRoute,
        path: props.payload.config.admin.routes.unauthorized,
      }),
    );
  const rootRunID =
    props.mode === "detail" && Array.isArray(props.params?.segments)
      ? props.params.segments.at(-1)
      : undefined;
  if (
    props.mode === "detail" &&
    (!rootRunID || !/^[a-zA-Z0-9_-]{1,128}$/.test(rootRunID))
  )
    notFound();
  return {
    runsURL: formatAdminURL({ adminRoute, path: props.runsRoute }).replace(
      /\/$/,
      "",
    ),
    chatURL: formatAdminURL({ adminRoute, path: props.chatRoute }).replace(
      /\/$/,
      "",
    ),
    settingsURL: formatAdminURL({
      adminRoute,
      path: props.settingsRoute,
    }).replace(/\/$/, ""),
    ...(rootRunID ? { rootRunID } : {}),
  };
};
