/**
 * @file src/components/admin/system-shell/systemAdmin.routes.ts
 * @version 1.6.0
 * @date 2026-10-19
 * @description Задаёт публичные маршруты самостоятельной системной оболочки.
 * @see documentation/architecture/system-admin-shell.md
 */

export const SYSTEM_TASK_MANAGER_REFERENCE_ROUTE =
  "/system/task-manager/reference";

/** Рабочие задачи используют постоянный server domain. */
export const SYSTEM_TASK_MANAGER_ROUTE = "/system/task-manager";

export const SYSTEM_WORKSHOP_ROUTE = "/system/workshop";
export const SYSTEM_APPEARANCE_ROUTE = "/system/appearance";
export const SYSTEM_ADMIN_ROUTE = "/system";
export const SYSTEM_ACCESS_ROUTE = "/system/access";
export const SYSTEM_ACCESS_DEVICE_ROUTE = "/system/access/device";

/** Фильтр содержит только идентификатор; сервер отдельно проверяет доступ к владельцу. */
export const systemUserAccessRoute = (ownerId: string) =>
  `${SYSTEM_ACCESS_ROUTE}?ownerId=${encodeURIComponent(ownerId)}`;

/** Native preview проверяется Payload dashboard; пакетный — самостоятельным route. */
export const systemAdminShellPreviewRoute = (
  planId: string,
  mode: "native" | "template",
) =>
  mode === "native"
    ? `/admin?adminShellPreview=${encodeURIComponent(planId)}`
    : `${SYSTEM_APPEARANCE_ROUTE}/shell-preview/${encodeURIComponent(planId)}`;

/** Actor-bound plan preview использует самостоятельный защищённый route. */
export const systemAppearancePreviewRoute = (planId: string) =>
  `${SYSTEM_APPEARANCE_ROUTE}/preview/${encodeURIComponent(planId)}`;

/** Host-вход в зарегистрированный Payload analytics view. */
export const SYSTEM_AI_ANALYTICS_ROUTE = "/admin/analytics/ai";

export const systemWorkshopProjectRoute = (projectId: string) =>
  `${SYSTEM_WORKSHOP_ROUTE}/${encodeURIComponent(projectId)}`;
