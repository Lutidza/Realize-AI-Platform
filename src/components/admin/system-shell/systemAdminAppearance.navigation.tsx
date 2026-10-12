/**
 * @file src/components/admin/system-shell/systemAdminAppearance.navigation.tsx
 * @version 1.2.0
 * @date 2026-10-12
 * @description Задаёт реальные ссылки каталога, назначения и истории в разделе оформления.
 * @see documentation/specifications/extension-management.md
 */
import { History, PanelsTopLeft, SlidersHorizontal } from "lucide-react";
import type { TemplateNavigationGroup } from "@realize/template-contracts/react";
import { SYSTEM_APPEARANCE_ROUTE } from "./systemAdmin.routes";

/** Полный путь корректен также в flyout других модулей; same-page hash сохраняет drafts. */
export const SYSTEM_ADMIN_APPEARANCE_NAVIGATION: TemplateNavigationGroup[] = [
  {
    id: "appearance-management",
    label: "Оформление",
    items: [
      {
        id: "admin-shell-assignment",
        label: "Оболочка Admin",
        icon: <PanelsTopLeft size={17} />,
        href: `${SYSTEM_APPEARANCE_ROUTE}#admin-shell-assignment`,
      },
      {
        id: "appearance-installed",
        label: "Установленные шаблоны",
        icon: <PanelsTopLeft size={17} />,
        href: `${SYSTEM_APPEARANCE_ROUTE}#appearance-installed`,
      },
      {
        id: "appearance-assignment",
        label: "Назначение оформления",
        icon: <SlidersHorizontal size={17} />,
        href: `${SYSTEM_APPEARANCE_ROUTE}#appearance-assignment`,
      },
      {
        id: "appearance-history",
        label: "История изменений",
        icon: <History size={17} />,
        href: `${SYSTEM_APPEARANCE_ROUTE}#appearance-history`,
      },
    ],
  },
];
