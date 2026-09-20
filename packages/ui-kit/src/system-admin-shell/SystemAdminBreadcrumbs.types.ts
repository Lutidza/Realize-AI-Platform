/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminBreadcrumbs.types.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Определяет контекстный путь без зависимости от маршрутизатора приложения.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { ReactNode } from "react";
import type { SystemAdminLocale } from "./systemAdminLocale.types";
import type { SystemAdminToolbarAction } from "./SystemAdminToolbar.types";

/** Choices имеют те же идентификаторы, что и items; host уже применил ACL и ограничения уровня. */
export type SystemAdminBreadcrumbItem = SystemAdminToolbarAction & {
  choices?: SystemAdminToolbarAction[];
  actions?: SystemAdminToolbarAction[];
  parentLabel?: string;
};

export type SystemAdminBreadcrumbMenuProps = {
  item: SystemAdminBreadcrumbItem;
  current: boolean;
  asHeading?: boolean;
  locale: SystemAdminLocale;
};

export type SystemAdminBreadcrumbsProps = {
  label?: string;
  locale?: SystemAdminLocale;
  items: SystemAdminBreadcrumbItem[];
  currentAsHeading?: boolean;
  currentBadge?: ReactNode;
};
