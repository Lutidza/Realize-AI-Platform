/**
 * @file src/components/admin/system-shell/systemAdminNavigation.types.ts
 * @version 1.3.0
 * @date 2026-09-18
 * @description Определяет действия host для общего каталога разделов системной админки.
 * @see documentation/architecture/system-admin-shell.md
 */

import type {
  SystemAdminNavigationItem,
  SystemAdminNavigationLink,
} from "@realize/ui-kit";

/** Раздел задач открывается действием текущего host без вымышленного общего маршрута. */
export type SystemAdminNavigationOptions = {
  onTasks: () => void;
  tasksPanel?: SystemAdminNavigationItem["panel"];
  /** Полный текущий каталог custom panel для персонального избранного. */
  tasksFavoriteLinks?: SystemAdminNavigationLink[];
};
