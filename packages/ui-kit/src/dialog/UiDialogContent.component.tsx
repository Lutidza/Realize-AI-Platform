/**
 * @file packages/ui-kit/src/dialog/UiDialogContent.component.tsx
 * @version 1.1.0
 * @date 2026-09-18
 * @description Монтирует содержимое общего диалога с отдельным циклом сохранения и возврата фокуса.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { UiButton } from "../button/UiButton.component";
import { UiTheme } from "../theme/UiTheme.component";
import type { UiDialogProps } from "./UiDialog.types";
import { useUiDialogFocus } from "./useUiDialogFocus.hook";
import styles from "./UiDialog.module.css";

/** Монтируется заново при каждом открытии, до autofocus дочерних inputs. */
export function UiDialogContent({
  title,
  description,
  mode,
  children,
  footer,
  size = "medium",
  placement = "center",
  role = "dialog",
  icon,
  hideCloseButton,
  initialFocusRef,
  onCloseAutoFocus,
}: UiDialogProps) {
  const {
    headingRef,
    onOpenAutoFocus,
    onCloseAutoFocus: restoreFocus,
  } = useUiDialogFocus({ onCloseAutoFocus, initialFocusRef });
  return (
    <UiTheme mode={mode} baseline className={styles.portal}>
      <Dialog.Overlay className={styles.overlay} data-placement={placement} />
      <Dialog.Content
        className={styles.content}
        role={role}
        data-size={size}
        data-placement={placement}
        {...(!description ? { "aria-describedby": undefined } : {})}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={restoreFocus}
      >
        <header className={styles.header}>
          {icon && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}
          <div className={styles.heading}>
            <Dialog.Title
              ref={headingRef}
              tabIndex={-1}
              className={styles.title}
            >
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description className={styles.description}>
                {description}
              </Dialog.Description>
            )}
          </div>
          {!hideCloseButton && (
            <Dialog.Close asChild>
              <UiButton
                variant="ghost"
                size="icon"
                aria-label="Закрыть диалог"
                className={styles.close}
              >
                <X size={19} aria-hidden="true" />
              </UiButton>
            </Dialog.Close>
          )}
        </header>
        {children != null && <div className={styles.body}>{children}</div>}
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </Dialog.Content>
    </UiTheme>
  );
}
