/**
 * @file packages/payload-ai-plugin/src/admin/usage/loadUsageView.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет owner/client право до рендера и отдаёт только публичные пути API.
 */
import { redirect } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";
import {
  DEFAULT_API_ROUTE,
  REALIZE_AI_SERVER_RUNTIME_KEY,
} from "../../constants";
import type { RealizeAIServerRuntime } from "../../types";
import type { UsageViewProps, UsageClientProps } from "./UsageView.types";

export async function loadUsageView(
  props: UsageViewProps,
): Promise<UsageClientProps> {
  const req = props.initPageResult.req;
  const config = props.payload.config;
  const adminRoute = config.routes.admin;
  if (!req.user)
    redirect(formatAdminURL({ adminRoute, path: config.admin.routes.login }));
  const runtime = config.custom?.[REALIZE_AI_SERVER_RUNTIME_KEY] as
    RealizeAIServerRuntime | undefined;
  const owner = Boolean(await runtime?.canViewPlatformUsage?.({ req }));
  const customer = Boolean(await runtime?.canViewUsage?.({ req }));
  const platform = props.view === "platform";
  if (platform ? !owner : !customer)
    redirect(
      formatAdminURL({ adminRoute, path: config.admin.routes.unauthorized }),
    );
  return {
    apiUrl: `${config.routes.api.replace(/\/$/, "")}${DEFAULT_API_ROUTE}/usage${platform ? "/platform" : ""}`,
    platform,
    switchUrl:
      owner && customer
        ? formatAdminURL({
            adminRoute,
            path: `${props.usageRoute}${platform ? "" : "/platform"}`,
          })
        : null,
  };
}
