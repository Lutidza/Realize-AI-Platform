/**
 * @file src/components/admin/system-shell/systemAdmin.routes.ts
 * @version 1.3.0
 * @date 2026-10-11
 * @description Задаёт публичные маршруты самостоятельной системной оболочки.
 * @see documentation/architecture/system-admin-shell.md
 */

export const SYSTEM_TASK_MANAGER_REFERENCE_ROUTE =
  "/system/task-manager/reference";

/** Рабочие задачи используют постоянный server domain. */
export const SYSTEM_TASK_MANAGER_ROUTE = "/system/task-manager";

export const SYSTEM_WORKSHOP_ROUTE = "/system/workshop";

/** Host-вход в зарегистрированный Payload analytics view. */
export const SYSTEM_AI_ANALYTICS_ROUTE = "/admin/analytics/ai";

export const systemWorkshopProjectRoute = (projectId: string) =>
  `${SYSTEM_WORKSHOP_ROUTE}/${encodeURIComponent(projectId)}`;
