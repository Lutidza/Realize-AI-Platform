/**
 * @file packages/ui-kit/src/theme/UiTheme.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет границу темы общего UI-кита.
 */

import type { ComponentProps } from "react";

export type UiThemeProps = ComponentProps<"div"> & { mode: "light" | "dark" };
