/**
 * @file packages/payload-ai-plugin/src/admin/useRealizeAINavigation.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет доступность и активность пунктов навигации AI и интеграций.
 */

"use client";

import { useAuth, useConfig } from "@payloadcms/ui";
import { usePathname } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";
import type {
  RealizeAINavLinkProps,
  RealizeAINavigationItem,
} from "./RealizeAINavLink.types";

export const useRealizeAINavigation = ({
  integrationsRoute,
  route,
}: RealizeAINavLinkProps): RealizeAINavigationItem[] => {
  const { user } = useAuth();
  const { config } = useConfig();
  const pathname = usePathname();
  const rawRoles: unknown = user?.roles;
  if (!Array.isArray(rawRoles) || !rawRoles.includes("admin")) return [];

  return [
    { id: "nav-realize-ai", label: "AI-ассистент", route },
    {
      id: "nav-realize-integrations",
      label: "Интеграции",
      route: integrationsRoute,
    },
  ].map((item) => {
    const href = formatAdminURL({
      adminRoute: config.routes.admin,
      path: item.route,
    }).replace(/\/$/, "");
    const isCurrentPage = pathname === href;
    const isActive =
      isCurrentPage ||
      (item.id === "nav-realize-integrations" &&
        pathname.startsWith(`${href}/`));
    return { href, id: item.id, isActive, isCurrentPage, label: item.label };
  });
};
