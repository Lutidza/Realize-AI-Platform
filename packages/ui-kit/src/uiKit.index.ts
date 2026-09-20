/**
 * @file packages/ui-kit/src/uiKit.index.ts
 * @version 1.19.0
 * @date 2026-09-18
 * @description Экспортирует общие примитивы и тему интерфейса Realize.
 */

export { UiTheme } from "./theme/UiTheme.component";
export type { UiThemeProps } from "./theme/UiTheme.types";
export { UiButton } from "./button/UiButton.component";
export type { UiButtonProps } from "./button/UiButton.types";
export { UiInput } from "./input/UiInput.component";
export type { UiInputProps } from "./input/UiInput.types";
export { UiSearchInput } from "./input/UiSearchInput.component";
export type { UiSearchInputProps } from "./input/UiSearchInput.types";
export { SystemAdminMenuContent } from "./system-admin-shell/SystemAdminMenuContent.component";
export type { SystemAdminMenuContentProps } from "./system-admin-shell/SystemAdminMenuContent.types";
export { SystemAdminDisclosureIcon } from "./system-admin-shell/SystemAdminDisclosureIcon.component";
export type { SystemAdminDisclosureIconProps } from "./system-admin-shell/SystemAdminDisclosureIcon.types";
export { UiSelect } from "./select/UiSelect.component";
export type { UiSelectProps } from "./select/UiSelect.types";
export { UiTextarea } from "./textarea/UiTextarea.component";
export type { UiTextareaProps } from "./textarea/UiTextarea.types";
export { UiBadge } from "./badge/UiBadge.component";
export { UiEntityMark } from "./entity-mark/UiEntityMark.component";
export type { UiEntityMarkProps } from "./entity-mark/UiEntityMark.types";
export type { UiBadgeProps, UiBadgeAccent } from "./badge/UiBadge.types";
export type { SystemAdminLocale } from "./system-admin-shell/systemAdminLocale.types";
export { UiSurface } from "./surface/UiSurface.component";
export type { UiSurfaceProps } from "./surface/UiSurface.types";
export { UiResizeHandle } from "./resize-handle/UiResizeHandle.component";
export type { UiResizeHandleProps } from "./resize-handle/UiResizeHandle.types";
export { UiSwitch } from "./switch/UiSwitch.component";
export type { UiSwitchProps } from "./switch/UiSwitch.types";
export { UiNotice } from "./notice/UiNotice.component";
export type { UiNoticeProps } from "./notice/UiNotice.types";
export { UiTabs } from "./tabs/UiTabs.component";
export type { UiTabsProps, UiTabItem } from "./tabs/UiTabs.types";

export { getUiButtonClassName } from "./button/getUiButtonClassName.util";

export { SystemAdminShell } from "./system-admin-shell/SystemAdminShell.component";
export { SystemAdminToolbar } from "./system-admin-shell/SystemAdminToolbar.component";
export { useSystemAdminActionMenu } from "./system-admin-shell/useSystemAdminActionMenu.hook";
export { SystemAdminBreadcrumbs } from "./system-admin-shell/SystemAdminBreadcrumbs.component";
export type {
  SystemAdminToolbarProps,
  SystemAdminToolbarAction,
  SystemAdminSearchEntry,
  SystemAdminNotification,
} from "./system-admin-shell/SystemAdminToolbar.types";
export type { SystemAdminBreadcrumbsProps } from "./system-admin-shell/SystemAdminBreadcrumbs.types";
export type {
  SystemAdminShellProps,
  SystemAdminNavigationItem,
  SystemAdminNavigationGroup,
  SystemAdminNavigationLink,
  SystemAdminNavigationGroupsProps,
  SystemAdminNavigationSectionProps,
} from "./system-admin-shell/SystemAdminShell.types";
export { UiDialog } from "./dialog/UiDialog.component";
export type { UiDialogProps } from "./dialog/UiDialog.types";
export { UiConfirmation } from "./dialog/UiConfirmation.component";
export type { UiConfirmationProps } from "./dialog/UiConfirmation.types";

export { SystemAdminNavigation } from "./system-admin-shell/SystemAdminNavigation.component";
export { SystemAdminNavigationGroups } from "./system-admin-shell/SystemAdminNavigationGroups.component";
export { SystemAdminNavigationSection } from "./system-admin-shell/SystemAdminNavigationSection.component";
export type { SystemAdminNavigationPreferences } from "./system-admin-shell/systemAdminNavigationPreferences.types";
export type { SystemAdminNavigationProps } from "./system-admin-shell/SystemAdminShell.types";
export { SystemAdminItemMenu } from "./system-admin-shell/SystemAdminItemMenu.component";
export type {
  SystemAdminItemMenuProps,
  SystemAdminItemMenuAction,
} from "./system-admin-shell/systemAdminFavorites.types";
