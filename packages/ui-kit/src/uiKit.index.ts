/**
 * @file packages/ui-kit/src/uiKit.index.ts
 * @version 1.5.0
 * @date 2026-09-10
 * @description Экспортирует общие примитивы и тему интерфейса Realize.
 */

export { UiTheme } from "./theme/UiTheme.component";
export type { UiThemeProps } from "./theme/UiTheme.types";
export { UiButton } from "./button/UiButton.component";
export type { UiButtonProps } from "./button/UiButton.types";
export { UiInput } from "./input/UiInput.component";
export type { UiInputProps } from "./input/UiInput.types";
export { UiSelect } from "./select/UiSelect.component";
export type { UiSelectProps } from "./select/UiSelect.types";
export { UiTextarea } from "./textarea/UiTextarea.component";
export type { UiTextareaProps } from "./textarea/UiTextarea.types";
export { UiBadge } from "./badge/UiBadge.component";
export type { UiBadgeProps } from "./badge/UiBadge.types";
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
