/**
 * @file packages/template-realizeai-control-panel/src/primitives/ControlPanelButton.component.tsx
 * @version 1.0.0
 * @date 2026-11-12
 * @description Предоставляет template-owned представление кнопки, включая toolbar reference.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { TemplateButtonProps } from "@realize/template-contracts/react";
import { UiButtonPrimitive } from "@realize/ui-kit";
import styles from "./ControlPanelButton.module.css";

/** Сохраняет native props/ref; toolbar не меняет default-кнопки и не импортирует legacy. */
export function ControlPanelButton({
  className,
  variant = "primary",
  size = "default",
  ...props
}: TemplateButtonProps) {
  return (
    <UiButtonPrimitive
      {...props}
      variant={variant}
      size={size}
      className={[styles.button, className].filter(Boolean).join(" ")}
      data-template-primitive="control-panel-button"
      data-control-panel-variant={variant}
      data-control-panel-size={size}
    />
  );
}
