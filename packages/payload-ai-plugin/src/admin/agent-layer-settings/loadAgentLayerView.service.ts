/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/loadAgentLayerView.service.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет отдельное право управления конфигурацией до отображения редактора.
 */

import { redirect } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";

import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../constants";
import type { RealizeAIServerRuntime } from "../../types";
import type { AgentLayerViewProps } from "./AgentLayerView.types";

/** Дополняет маршрут текущим routes.admin; доступ не зависит от наличия подключения Codex. */
export const loadAgentLayerView = async (props: AgentLayerViewProps) => {
  const req = props.initPageResult.req;
  const adminRoute = props.payload.config.routes.admin;
  if (!req.user) {
    redirect(
      formatAdminURL({
        adminRoute,
        path: props.payload.config.admin.routes.login,
      }),
    );
  }
  const runtime = props.payload.config.custom?.[
    REALIZE_AI_SERVER_RUNTIME_KEY
  ] as RealizeAIServerRuntime | undefined;
  if (!runtime || !(await runtime.canManageAIConfiguration({ req }))) {
    redirect(
      formatAdminURL({
        adminRoute,
        path: props.payload.config.admin.routes.unauthorized,
      }),
    );
  }
  return {
    settingsURL: formatAdminURL({
      adminRoute,
      path: props.settingsRoute,
    }).replace(/\/$/, ""),
  };
};
