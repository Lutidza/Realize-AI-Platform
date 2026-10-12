/**
 * @file packages/template-realize/src/realizeTemplateUi.index.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Предоставляет составные элементы и контракты интерфейса единственного шаблона Realize.
 * @see documentation/architecture/system-admin-shell.md
 */

export { SystemAdminMenuContent } from "./layouts/admin/SystemAdminMenuContent.component";
export type { SystemAdminMenuContentProps } from "./layouts/admin/SystemAdminMenuContent.types";
export { SystemAdminDisclosureIcon } from "./layouts/admin/SystemAdminDisclosureIcon.component";
export type { SystemAdminDisclosureIconProps } from "./layouts/admin/SystemAdminDisclosureIcon.types";
export type { SystemAdminLocale } from "./layouts/admin/systemAdminLocale.types";
export { SystemAdminShell } from "./layouts/admin/SystemAdminShell.component";
export { SystemAdminToolbar } from "./layouts/admin/SystemAdminToolbar.component";
export { useSystemAdminActionMenu } from "./layouts/admin/useSystemAdminActionMenu.hook";
export { SystemAdminBreadcrumbs } from "./layouts/admin/SystemAdminBreadcrumbs.component";
export type {
  SystemAdminToolbarProps,
  SystemAdminToolbarAction,
  SystemAdminSearchEntry,
  SystemAdminNotification,
} from "./layouts/admin/SystemAdminToolbar.types";
export type { SystemAdminBreadcrumbsProps } from "./layouts/admin/SystemAdminBreadcrumbs.types";
export type {
  SystemAdminShellProps,
  SystemAdminNavigationItem,
  SystemAdminNavigationGroup,
  SystemAdminNavigationLink,
  SystemAdminNavigationGroupsProps,
  SystemAdminNavigationSectionProps,
} from "./layouts/admin/SystemAdminShell.types";
export { SystemAdminNavigation } from "./layouts/admin/SystemAdminNavigation.component";
export { SystemAdminNavigationGroups } from "./layouts/admin/SystemAdminNavigationGroups.component";
export { SystemAdminNavigationSection } from "./layouts/admin/SystemAdminNavigationSection.component";
export type { SystemAdminNavigationPreferences } from "./layouts/admin/systemAdminNavigationPreferences.types";
export type { SystemAdminNavigationProps } from "./layouts/admin/SystemAdminShell.types";
export { SystemAdminItemMenu } from "./layouts/admin/SystemAdminItemMenu.component";
export type {
  SystemAdminItemMenuProps,
  SystemAdminItemMenuAction,
} from "./layouts/admin/systemAdminFavorites.types";
