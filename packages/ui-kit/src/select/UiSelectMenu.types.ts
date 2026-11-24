/**
 * @file packages/ui-kit/src/select/UiSelectMenu.types.ts
 * @version 1.0.0
 * @date 2026-11-11
 * @description Определяет совместимый controlled API кастомного списка выбора.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateMode } from "@realize/template-contracts";

export type UiSelectMenuOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/** Значения options непустые; пустая строка value зарезервирована Radix для placeholder. */
export type UiSelectMenuProps = {
  id?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly UiSelectMenuOption[];
  mode: TemplateMode;
  disabled?: boolean;
  placeholder?: string;
};
