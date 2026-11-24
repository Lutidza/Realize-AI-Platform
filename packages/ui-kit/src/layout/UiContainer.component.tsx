/**
 * @file packages/ui-kit/src/layout/UiContainer.component.tsx
 * @version 1.0.0
 * @date 2026-11-12
 * @description Ограничивает ширину содержимого без дополнительных внешних отступов.
 * @see documentation/architecture/ui-kit.md
 */
import type { UiContainerProps } from "./UiLayout.types";
import styles from "./UiLayout.module.css";

/** Подходит для server/client композиции; значения ширины получает из palette tokens. */
export function UiContainer({
  variant = "fluid",
  className,
  ...props
}: UiContainerProps) {
  return (
    <div
      {...props}
      className={[styles.container, className].filter(Boolean).join(" ")}
      data-ui="container"
      data-ui-container={variant}
    />
  );
}
