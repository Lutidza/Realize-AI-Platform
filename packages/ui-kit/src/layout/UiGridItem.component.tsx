/**
 * @file packages/ui-kit/src/layout/UiGridItem.component.tsx
 * @version 1.0.0
 * @date 2026-11-12
 * @description Размещает элемент по адаптивным spans ближайшей сетки без JS media queries.
 * @see documentation/architecture/ui-kit.md
 */
import type { UiGridItemProps, UiGridItemStyle } from "./UiLayout.types";
import styles from "./UiLayout.module.css";

/** Пропущенный breakpoint сохраняет предыдущее значение; по умолчанию элемент занимает 12 колонок. */
export function UiGridItem({
  span = 12,
  style,
  className,
  ...props
}: UiGridItemProps) {
  const spans = typeof span === "number" ? { base: span } : span;
  const base = spans.base ?? 12;
  const md = spans.md ?? base;
  const lg = spans.lg ?? md;
  const gridStyle: UiGridItemStyle = {
    "--ui-grid-span-base": base,
    "--ui-grid-span-md": md,
    "--ui-grid-span-lg": lg,
    ...style,
  };
  return (
    <div
      {...props}
      className={[styles.item, className].filter(Boolean).join(" ")}
      style={gridStyle}
      data-ui="grid-item"
    />
  );
}
