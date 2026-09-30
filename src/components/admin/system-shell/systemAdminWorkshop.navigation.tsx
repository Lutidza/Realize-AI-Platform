/**
 * @file src/components/admin/system-shell/systemAdminWorkshop.navigation.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Задаёт единые ссылки раздела Мастерской для общей навигации.
 * @see documentation/specifications/design-workshop.md
 */

import { FolderOpen, ListTodo } from "lucide-react";
import type { SystemAdminNavigationGroup } from "@realize/ui-kit";
import {
  SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
  SYSTEM_WORKSHOP_ROUTE,
} from "./systemAdmin.routes";

/** Один каталог ссылок используется rail/flyout и постоянной колонкой Мастерской. */
export const SYSTEM_ADMIN_WORKSHOP_NAVIGATION: SystemAdminNavigationGroup[] = [
  {
    id: "workshop-projects",
    label: "Мастерская",
    items: [
      {
        id: "workshop-library",
        label: "Мои проекты",
        icon: <FolderOpen size={17} />,
        href: SYSTEM_WORKSHOP_ROUTE,
      },
    ],
  },
  {
    id: "workshop-references",
    label: "В проекте",
    items: [
      {
        id: "workshop-task-reference",
        label: "Task Manager · референс",
        icon: <ListTodo size={17} />,
        href: SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
      },
    ],
  },
];
