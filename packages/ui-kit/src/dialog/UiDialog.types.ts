/**
 * @file packages/ui-kit/src/dialog/UiDialog.types.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Описывает управляемый общий диалог с темой, размерами и возвратом фокуса.
 */

import type { ReactNode, RefObject } from "react";

/** Потребитель подтверждает закрытие через open; несохранённый ввод остаётся в его draft. */
export type UiDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  mode: "light" | "dark";
  children?: ReactNode;
  footer?: ReactNode;
  size?: "compact" | "medium" | "wide";
  placement?: "center" | "notification";
  role?: "dialog" | "alertdialog";
  /** Декоративный маркер; текстовое значение остаётся в title/description. */
  icon?: ReactNode;
  hideCloseButton?: boolean;
  /** Для подтверждения опасного действия начальный фокус получает отмена. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  onCloseAutoFocus?: (event: Event) => void;
};
