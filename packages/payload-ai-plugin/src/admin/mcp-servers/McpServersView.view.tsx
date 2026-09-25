/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServersView.view.tsx
 * @version 1.0.0
 * @date 2026-09-20
 * @description Размещает управление экземплярами MCP в штатном Payload Admin.
 * @see documentation/specifications/internal-mcp.md
 */

import { DefaultTemplate } from "@payloadcms/next/templates";
import { SetStepNav } from "@payloadcms/ui";
import { Suspense } from "react";
import { McpServersClient } from "./McpServersClient.component";
import type { McpServersViewProps } from "./McpServersView.types";
import { loadMcpServersView } from "./loadMcpServersView.service";

/** Клиент получает только адреса; данные читает API с текущими правами пользователя. */
export const McpServersView = async (props: McpServersViewProps) => {
  const clientProps = await loadMcpServersView(props);
  const { locale, permissions, req, visibleEntities } = props.initPageResult;
  return (
    <DefaultTemplate
      {...props}
      i18n={req.i18n}
      locale={locale}
      permissions={permissions}
      req={req}
      user={req.user ?? undefined}
      viewType="realize-mcp-servers"
      visibleEntities={{
        collections: visibleEntities.collections,
        globals: visibleEntities.globals,
      }}
    >
      <SetStepNav
        nav={[
          { label: "MCP-серверы", url: clientProps.catalogURL },
          ...(clientProps.serverID ? [{ label: "Настройки сервера" }] : []),
        ]}
      />
      <Suspense fallback={<p role="status">Загружаем MCP-серверы…</p>}>
        <McpServersClient {...clientProps} />
      </Suspense>
    </DefaultTemplate>
  );
};
