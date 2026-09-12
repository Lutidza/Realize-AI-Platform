/**
 * @file packages/ui-kit/src/tabs/useUiTabs.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Управляет клавиатурным фокусом и связями доступных вкладок.
 */

"use client";

import { useId } from "react";
import type { KeyboardEvent } from "react";
import type { UiTabsProps } from "./UiTabs.types";

export const useUiTabs = ({ items, onValueChange, disabled }: UiTabsProps) => {
  const id = useId();
  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (disabled || !items.length) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft")
      next = (index + items.length - 1) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    onValueChange(items[next].id);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };
  return { id, onKeyDown };
};
