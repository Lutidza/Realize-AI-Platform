/**
 * @file packages/ui-kit/src/tabs/UiTabs.types.ts
 * @version 1.1.0
 * @date 2026-09-17
 * @description Описывает управляемые вкладки с сохраняемым содержимым панелей.
 */

import type { ReactNode } from "react";

export type UiTabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
};

/** Значение принадлежит потребителю; скрытые панели сохраняют состояние формы. */
export type UiTabsProps = {
  label: string;
  items: UiTabItem[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  appearance?: "pills" | "underline";
};
