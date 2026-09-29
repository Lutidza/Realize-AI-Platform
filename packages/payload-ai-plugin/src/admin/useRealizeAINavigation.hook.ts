/**
 * @file packages/payload-ai-plugin/src/admin/useRealizeAINavigation.hook.ts
 * @version 1.6.0
 * @date 2026-09-27
 * @description Определяет доступность и активность пунктов навигации AI и интеграций.
 */

"use client";

import { useAuth, useConfig } from "@payloadcms/ui";
import { usePathname } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";
import { useChatPresentation } from "./chat-presentation/useChatPresentation.hook";
import type {
  RealizeAINavLinkProps,
  RealizeAINavigationGroup,
} from "./RealizeAINavLink.types";

export const useRealizeAINavigation = ({
  group,
  integrationsRoute,
  mcpServersRoute,
  route,
}: RealizeAINavLinkProps): RealizeAINavigationGroup[] => {
  const { user } = useAuth();
  const { config } = useConfig();
  const pathname = usePathname();
  const chat = useChatPresentation();
  const rawRoles: unknown = user?.roles;
  if (!Array.isArray(rawRoles) || !rawRoles.includes("admin")) return [];

  return [
    {
      label: group,
      links: [
        { id: "nav-realize-ai", label: "AI-ассистент", route },
        {
          id: "nav-realize-workflow-runs",
          label: "Запуски процессов",
          route: `${route.replace(/\/$/, "")}/runs` as `/${string}`,
        },
        {
          id: "nav-realize-search",
          label: "Диагностика поиска",
          route: `${route.replace(/\/$/, "")}/search` as `/${string}`,
        },
      ],
    },
    {
      label: "Настройки",
      links: [
        {
          id: "nav-realize-integrations",
          label: "Интеграции",
          route: integrationsRoute,
        },
        {
          id: "nav-realize-mcp-servers",
          label: "MCP-серверы",
          route: mcpServersRoute,
        },
        {
          id: "nav-realize-ai-settings",
          label: "Агентский слой",
          route: `${route.replace(/\/$/, "")}/settings` as `/${string}`,
        },
      ],
    },
  ].map((section) => ({
    label: section.label,
    links: section.links.map((item) => {
      const href = formatAdminURL({
        adminRoute: config.routes.admin,
        path: item.route,
      }).replace(/\/$/, "");
      const isCurrentPage = pathname === href;
      const isActive =
        isCurrentPage ||
        (item.id !== "nav-realize-ai" && pathname.startsWith(`${href}/`));
      return {
        href,
        id: item.id,
        isActive,
        isCurrentPage,
        label: item.label,
        ...(item.id === "nav-realize-ai" && chat
          ? {
              onClick: () => chat.openChat(),
              disabled: !chat.settings,
              isActive: isActive || chat.panelOpen,
            }
          : {}),
      };
    }),
  }));
};
