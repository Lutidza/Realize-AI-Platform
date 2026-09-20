/**
 * @file packages/ui-kit/src/entity-mark/UiEntityMark.types.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Определяет компактный визуальный знак объекта с иконкой или изображением.
 */
import type { ReactNode } from "react";
import type { UiBadgeAccent } from "../badge/UiBadge.types";

export type UiEntityMarkProps = {
  label: string;
  icon: ReactNode;
  imageSrc?: string;
  accent?: UiBadgeAccent;
  size?: "small" | "medium";
};
