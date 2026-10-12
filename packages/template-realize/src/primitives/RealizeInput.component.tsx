/**
 * @file packages/template-realize/src/primitives/RealizeInput.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Подключает input пакета Realize без изменения native events/ref и доступности.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateInputProps } from "@realize/template-contracts/react";
import { UiInputPrimitive } from "@realize/ui-kit";
import styles from "./RealizePrimitives.module.css";

/** Собственный class/marker не меняет дефолтную геометрию или host event semantics. */
export function RealizeInput({ className, ...props }: TemplateInputProps) {
  return (
    <UiInputPrimitive
      {...props}
      className={[styles.input, className].filter(Boolean).join(" ")}
      data-template-primitive="realize-input"
    />
  );
}
