/**
 * @file packages/ui-kit/src/dialog/UiConfirmation.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Запрашивает явное решение в компактной тематической карточке без таймера.
 * @see documentation/architecture/ui-kit.md
 */
"use client";

import { useRef } from "react";
import { CircleHelp, LoaderCircle, LockKeyhole, Trash2 } from "lucide-react";
import { UiButton } from "../button/UiButton.component";
import { UiNotice } from "../notice/UiNotice.component";
import { UiDialog } from "./UiDialog.component";
import type { UiConfirmationProps } from "./UiConfirmation.types";
import styles from "./UiConfirmation.module.css";

/** Семантика и focus принадлежат общему диалогу; данные, права и результат — потребителю. */
export function UiConfirmation({
  title,
  subject,
  description,
  confirmLabel,
  cancelLabel = "Отмена",
  tone = "primary",
  onConfirm,
  blockedReason,
  error,
  pending = false,
  onOpenChange,
  ...props
}: UiConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const Icon = blockedReason
    ? LockKeyhole
    : tone === "danger"
      ? Trash2
      : CircleHelp;
  return (
    <UiDialog
      {...props}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
      title={title}
      description={
        <>
          <span className={styles.subject}>{subject}</span>
          <span className={styles.description}>
            {blockedReason || description}
          </span>
        </>
      }
      size="compact"
      placement="notification"
      role="alertdialog"
      hideCloseButton
      initialFocusRef={cancelRef}
      icon={
        <span
          className={styles.marker}
          data-tone={blockedReason ? "neutral" : tone}
        >
          <Icon size={20} strokeWidth={1.75} />
        </span>
      }
      footer={
        <div className={styles.actions} aria-busy={pending}>
          <UiButton
            ref={cancelRef}
            variant="secondary"
            size="small"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {blockedReason ? "Понятно" : cancelLabel}
          </UiButton>
          {!blockedReason && (
            <UiButton
              variant={tone}
              size="small"
              disabled={pending}
              onClick={() => {
                if (!pending) onConfirm();
              }}
            >
              {pending && (
                <LoaderCircle
                  size={15}
                  className={styles.spinner}
                  aria-hidden="true"
                />
              )}
              {pending ? "Выполняется…" : confirmLabel}
            </UiButton>
          )}
        </div>
      }
    >
      {error ? (
        <UiNotice tone="danger" role="alert">
          {error}
        </UiNotice>
      ) : null}
    </UiDialog>
  );
}
