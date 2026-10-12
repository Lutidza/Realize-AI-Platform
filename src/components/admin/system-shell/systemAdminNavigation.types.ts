/**
 * @file src/components/admin/system-shell/systemAdminNavigation.types.ts
 * @version 1.3.1
 * @date 2026-10-12
 * @description Определяет действия host для общего каталога разделов системной админки.
 * @see documentation/architecture/system-admin-shell.md
 */

import type {
  TemplateNavigationItem as SystemAdminNavigationItem,
  TemplateNavigationLink as SystemAdminNavigationLink,
} from "@realize/template-contracts/react";

/** Раздел задач открывается действием текущего host без вымышленного общего маршрута. */
export type SystemAdminNavigationOptions = {
  onTasks: () => void;
  tasksPanel?: SystemAdminNavigationItem["panel"];
  /** Полный текущий каталог custom panel для персонального избранного. */
  tasksFavoriteLinks?: SystemAdminNavigationLink[];
};
