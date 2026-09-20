/**
 * @file packages/ui-kit/src/input/UiSearchInput.types.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Задаёт native-контракт общего поля поиска и его плотность.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { UiInputProps } from "./UiInput.types";

export type UiSearchInputProps = Omit<UiInputProps, "type"> & {
  density?: "compact" | "regular";
};
