/**
 * @file src/components/admin/system-shell/systemAdminSettings.navigation.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Задаёт общую навигацию управления доступами и отмечает текущую страницу.
 * @see documentation/architecture/platform-access.md
 */
import { KeyRound, Plug, Terminal } from "lucide-react";
import type { TemplateNavigationGroup } from "@realize/template-contracts/react";
import {
  SYSTEM_ACCESS_DEVICE_ROUTE,
  SYSTEM_ACCESS_ROUTE,
} from "./systemAdmin.routes";

/** Native MCP route подчиняется общему фильтру доступности оболочки. */
export function getSystemAdminSettingsNavigation(
  currentPath?: string,
): TemplateNavigationGroup[] {
  return [
    {
      id: "settings-access",
      label: "Доступы",
      items: [
        {
          id: "settings-access-tokens",
          label: "Доступы и токены",
          icon: <KeyRound size={17} aria-hidden />,
          href: SYSTEM_ACCESS_ROUTE,
          active: currentPath === SYSTEM_ACCESS_ROUTE,
        },
        {
          id: "settings-access-device",
          label: "Подключение CLI",
          icon: <Terminal size={17} aria-hidden />,
          href: SYSTEM_ACCESS_DEVICE_ROUTE,
          active: currentPath === SYSTEM_ACCESS_DEVICE_ROUTE,
        },
        {
          id: "settings-mcp-servers",
          label: "MCP-серверы",
          icon: <Plug size={17} aria-hidden />,
          href: "/admin/mcp-servers",
          active: currentPath === "/admin/mcp-servers",
        },
      ],
    },
  ];
}
