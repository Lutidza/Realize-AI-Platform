/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/loadSearchObservationsView.service.ts
 * @version 1.0.0
 * @date 2026-09-27
 * @description Проверяет installation-owned право и формирует путь API без данных хранилища.
 */
import { redirect } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";
import {
  DEFAULT_API_ROUTE,
  REALIZE_AI_SERVER_RUNTIME_KEY,
} from "../../constants";
import type { RealizeAIServerRuntime } from "../../types";
import type { SearchObservationsViewProps } from "./SearchObservations.types";
export async function loadSearchObservationsView(
  props: SearchObservationsViewProps,
) {
  const req = props.initPageResult.req;
  const config = props.payload.config;
  const adminRoute = config.routes.admin;
  if (!req.user)
    redirect(formatAdminURL({ adminRoute, path: config.admin.routes.login }));
  const runtime = config.custom?.[REALIZE_AI_SERVER_RUNTIME_KEY] as
    RealizeAIServerRuntime | undefined;
  if (!runtime || !(await runtime.canManageAIConfiguration({ req })))
    redirect(
      formatAdminURL({ adminRoute, path: config.admin.routes.unauthorized }),
    );
  return {
    apiURL: `${config.routes.api.replace(/\/$/, "")}${DEFAULT_API_ROUTE}`,
  };
}
