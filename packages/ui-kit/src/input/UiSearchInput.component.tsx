/**
 * @file packages/ui-kit/src/input/UiSearchInput.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Отображает общее поле поиска с мягкой поверхностью и native-поведением ввода.
 * @see documentation/architecture/system-admin-shell.md
 */
import { Search } from "lucide-react";
import { UiInput } from "./UiInput.component";
import type { UiSearchInputProps } from "./UiSearchInput.types";
import styles from "./UiSearchInput.module.css";

export function UiSearchInput({
  className,
  density = "regular",
  ...props
}: UiSearchInputProps) {
  return (
    <div
      className={[styles.search, className].filter(Boolean).join(" ")}
      data-density={density}
      data-ui="search-input"
    >
      <Search size={16} aria-hidden="true" />
      <UiInput
        {...props}
        type="search"
        data-appearance="plain"
        className={styles.input}
      />
    </div>
  );
}
