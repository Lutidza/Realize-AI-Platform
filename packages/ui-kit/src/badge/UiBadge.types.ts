/**
 * @file packages/ui-kit/src/badge/UiBadge.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет текстовый статус интерфейса и его семантический тон.
 */

import type { ComponentProps } from "react";

export type UiBadgeProps = ComponentProps<"span"> & {
  tone?: "neutral" | "positive" | "danger";
  dot?: boolean;
};
