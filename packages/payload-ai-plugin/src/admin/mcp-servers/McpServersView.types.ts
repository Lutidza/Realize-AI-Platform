/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServersView.types.ts
 * @version 1.0.0
 * @date 2026-09-20
 * @description Описывает серверные параметры и безопасные адреса представлений MCP.
 * @see documentation/specifications/internal-mcp.md
 */

import type { AdminViewServerProps } from "payload";

export type McpServersViewProps = AdminViewServerProps & {
  mcpServersRoute: `/${string}`;
  mode: "list" | "detail";
};

/** Пользователь, PayloadRequest и server-only настройки остаются в RSC. */
export type McpServersViewData = {
  catalogURL: string;
  managementAPIURL: string;
  serverID?: string;
};
