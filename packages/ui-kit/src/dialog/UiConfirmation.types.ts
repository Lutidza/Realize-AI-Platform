/**
 * @file packages/ui-kit/src/dialog/UiConfirmation.types.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Определяет управляемое подтверждение действия с блокировкой и состоянием выполнения.
 * @see documentation/architecture/ui-kit.md
 */
import type { ReactNode } from "react";
import type { UiDialogProps } from "./UiDialog.types";

/** Потребитель выполняет действие и закрывает карточку только после подтверждённого результата. */
export type UiConfirmationProps = Pick<
  UiDialogProps,
  "open" | "onOpenChange" | "mode" | "onCloseAutoFocus"
> & {
  title: string;
  subject: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  /** Запрет объясняется вместо неактивной кнопки подтверждения. */
  blockedReason?: string;
  error?: string;
  pending?: boolean;
};
