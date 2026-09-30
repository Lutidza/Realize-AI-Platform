/**
 * @file src/components/admin/system-shell/systemAdmin.routes.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Задаёт публичные маршруты самостоятельной системной оболочки.
 * @see documentation/architecture/system-admin-shell.md
 */

export const SYSTEM_TASK_MANAGER_REFERENCE_ROUTE =
  "/system/task-manager/reference";

export const SYSTEM_WORKSHOP_ROUTE = "/system/workshop";

export const systemWorkshopProjectRoute = (projectId: string) =>
  `${SYSTEM_WORKSHOP_ROUTE}/${encodeURIComponent(projectId)}`;
