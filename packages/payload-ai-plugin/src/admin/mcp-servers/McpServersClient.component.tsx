/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServersClient.component.tsx
 * @version 1.0.0
 * @date 2026-09-23
 * @description Выбирает каталог или страницу экземпляра MCP внутри общей Admin темы.
 */
"use client";
import { AdminUiTheme } from "../AdminUiTheme.component";
import type { McpServersViewData } from "./McpServersView.types";
import { McpServersCatalog } from "./McpServersCatalog.component";
import { McpServerDetail } from "./McpServerDetail.component";
import styles from "./McpServers.module.css";
export function McpServersClient(props: McpServersViewData) {
  return (
    <AdminUiTheme>
      <div className={styles.page}>
        {props.serverID ? (
          <McpServerDetail key={props.serverID} {...props} />
        ) : (
          <McpServersCatalog {...props} />
        )}
      </div>
    </AdminUiTheme>
  );
}
