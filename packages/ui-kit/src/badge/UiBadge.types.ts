/**
 * @file packages/ui-kit/src/badge/UiBadge.types.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Определяет текстовый статус интерфейса и его семантический тон.
 */

import type { ComponentProps } from "react";

export type UiBadgeAccent =
  "purple" | "blue" | "cyan" | "green" | "amber" | "rose";

export type UiBadgeProps = ComponentProps<"span"> & {
  tone?: "neutral" | "positive" | "danger";
  /** Цвет категории имеет приоритет над tone; цвета и контраст задаёт общая тема. */
  accent?: UiBadgeAccent;
  dot?: boolean;
};
