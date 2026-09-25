/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/loadMcpServersView.service.ts
 * @version 1.0.0
 * @date 2026-09-20
 * @description Проверяет право управления MCP и формирует адреса текущей установки.
 * @see documentation/specifications/internal-mcp.md
 */

import { notFound, redirect } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";
import {
  DEFAULT_API_ROUTE,
  REALIZE_AI_SERVER_RUNTIME_KEY,
} from "../../constants";
import type { RealizeAIServerRuntime } from "../../types";
import type {
  McpServersViewData,
  McpServersViewProps,
} from "./McpServersView.types";

/** Проверка страницы не заменяет повторную авторизацию management endpoint. */
export const loadMcpServersView = async (
  props: McpServersViewProps,
): Promise<McpServersViewData> => {
  const req = props.initPageResult.req;
  const config = props.payload.config;
  const adminRoute = config.routes.admin;
  if (!req.user) {
    redirect(formatAdminURL({ adminRoute, path: config.admin.routes.login }));
  }
  const runtime = config.custom?.[REALIZE_AI_SERVER_RUNTIME_KEY] as
    RealizeAIServerRuntime | undefined;
  if (!runtime || !(await runtime.canManageIntegrations({ req }))) {
    redirect(
      formatAdminURL({ adminRoute, path: config.admin.routes.unauthorized }),
    );
  }
  const serverID =
    props.mode === "detail" && Array.isArray(props.params?.segments)
      ? props.params.segments.at(-1)
      : undefined;
  if (
    props.mode === "detail" &&
    (!serverID ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(serverID))
  ) {
    notFound();
  }
  return {
    catalogURL: formatAdminURL({
      adminRoute,
      path: props.mcpServersRoute,
    }).replace(/\/$/, ""),
    managementAPIURL: `${config.routes.api.replace(/\/$/, "")}${DEFAULT_API_ROUTE}/mcp-servers`,
    ...(serverID ? { serverID } : {}),
  };
};
