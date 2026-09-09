/**
 * @file packages/ui-kit/src/switch/UiSwitch.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сохраняет нативный контракт checkbox для переключателя UI-кита.
 */

import type { ComponentProps } from "react";

/** Передаёт состояние, события, ref и имя полю; тип и роль закреплены за переключателем. */
export type UiSwitchProps = Omit<
  ComponentProps<"input">,
  "type" | "role" | "children"
>;
