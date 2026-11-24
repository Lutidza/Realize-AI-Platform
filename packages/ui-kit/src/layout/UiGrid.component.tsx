/**
 * @file packages/ui-kit/src/layout/UiGrid.component.tsx
 * @version 1.0.0
 * @date 2026-11-12
 * @description Создаёт 12-колоночную сетку и локальный query container для её элементов.
 * @see documentation/architecture/ui-kit.md
 */
import type { UiGridProps } from "./UiLayout.types";
import styles from "./UiLayout.module.css";

/** Style позволяет независимо задать gutter-токены, сохранив защиту узкой сетки от переполнения. */
export function UiGrid({ className, ...props }: UiGridProps) {
  return (
    <div
      {...props}
      className={[styles.grid, className].filter(Boolean).join(" ")}
      data-ui="grid"
    />
  );
}
