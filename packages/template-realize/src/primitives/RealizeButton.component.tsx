/**
 * @file packages/template-realize/src/primitives/RealizeButton.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Подключает кнопку пакета Realize к native props/ref без повторного adapter lookup.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateButtonProps } from "@realize/template-contracts/react";
import { UiButtonPrimitive } from "@realize/ui-kit";
import styles from "./RealizePrimitives.module.css";

/** Базовый primitive сохраняет геометрию reference, disabled, events и переданный ref. */
export function RealizeButton({ className, ...props }: TemplateButtonProps) {
  return (
    <UiButtonPrimitive
      {...props}
      className={[styles.button, className].filter(Boolean).join(" ")}
      data-template-primitive="realize-button"
    />
  );
}
