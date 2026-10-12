/**
 * @file packages/ui-kit/src/input/UiInputPrimitive.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Реализует базовый native input без повторного разрешения template adapter.
 */
import type { UiInputProps } from "./UiInput.types";
import styles from "./UiInput.module.css";

/** Template composition сохраняет events/ref и доступные связи label/description. */
export function UiInputPrimitive({ className, ...props }: UiInputProps) {
  return (
    <input
      {...props}
      className={[styles.input, className].filter(Boolean).join(" ")}
      data-ui="input"
    />
  );
}
