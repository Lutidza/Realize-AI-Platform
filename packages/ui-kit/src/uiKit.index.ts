/**
 * @file packages/ui-kit/src/uiKit.index.ts
 * @version 2.3.0
 * @date 2026-11-12
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
export { UiSelect } from "./select/UiSelect.component";
export type { UiSelectProps } from "./select/UiSelect.types";
export { UiTextarea } from "./textarea/UiTextarea.component";
export type { UiTextareaProps } from "./textarea/UiTextarea.types";
export { UiBadge } from "./badge/UiBadge.component";
export { UiEntityMark } from "./entity-mark/UiEntityMark.component";
export type { UiEntityMarkProps } from "./entity-mark/UiEntityMark.types";
export type { UiBadgeProps, UiBadgeAccent } from "./badge/UiBadge.types";
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

export { UiDialog } from "./dialog/UiDialog.component";
export type { UiDialogProps } from "./dialog/UiDialog.types";
export { UiConfirmation } from "./dialog/UiConfirmation.component";
export type { UiConfirmationProps } from "./dialog/UiConfirmation.types";

export { UiTemplateProvider } from "./template-runtime/UiTemplateProvider.component";
export type { UiTemplateProviderProps } from "./template-runtime/UiTemplateRuntime.types";
export { UiButtonPrimitive } from "./button/UiButtonPrimitive.component";
export { UiInputPrimitive } from "./input/UiInputPrimitive.component";

export { UiDatePicker } from "./date-picker/UiDatePicker.component";
export type {
  UiDatePickerProps,
  UiDateRange,
} from "./date-picker/UiDatePicker.types";
export {
  parseUiCalendarDate,
  formatUiCalendarDate,
} from "./date-picker/uiCalendarDate.util";

export { UiPopover } from "./popover/UiPopover.component";
export type { UiPopoverProps } from "./popover/UiPopover.types";
export { UiSelectMenu } from "./select/UiSelectMenu.component";
export type {
  UiSelectMenuProps,
  UiSelectMenuOption,
} from "./select/UiSelectMenu.types";

export { UiContainer } from "./layout/UiContainer.component";
export { UiGrid } from "./layout/UiGrid.component";
export { UiGridItem } from "./layout/UiGridItem.component";
export type {
  UiContainerVariant,
  UiContainerProps,
  UiGridProps,
  UiGridStyle,
  UiGridSpan,
  UiGridResponsiveSpan,
  UiGridItemProps,
} from "./layout/UiLayout.types";
