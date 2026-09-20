/**
 * @file packages/ui-kit/src/theme/UiTheme.types.ts
 * @version 1.1.0
 * @date 2026-09-17
 * @description Определяет границу темы общего UI-кита.
 */

import type { ComponentProps } from "react";

/** Baseline включается явно у самостоятельной оболочки или portal, не меняя прежних consumers. */
export type UiThemeProps = ComponentProps<"div"> & {
  mode: "light" | "dark";
  baseline?: boolean;
};
