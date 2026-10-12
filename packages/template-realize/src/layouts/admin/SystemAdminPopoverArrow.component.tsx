/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminPopoverArrow.component.tsx
 * @version 1.1.1
 * @date 2026-10-12
 * @description Рисует вытянутый указатель с открытым основанием для flyout и Radix меню.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { SystemAdminPopoverArrowProps } from "./SystemAdminPopoverArrow.types";
import styles from "./SystemAdminPopover.module.css";

export function SystemAdminPopoverArrow({
  inline,
  className,
  style,
}: SystemAdminPopoverArrowProps) {
  if (inline)
    return (
      <svg
        width="12"
        height="20"
        viewBox="0 0 12 20"
        aria-hidden="true"
        data-ui="popover-arrow"
        className={[styles.arrow, styles.inlineArrow, className]
          .filter(Boolean)
          .join(" ")}
        style={style}
      >
        <path d="M12 0 0 10 12 20" />
      </svg>
    );
  return (
    <DropdownMenu.Arrow asChild aria-hidden="true">
      <svg
        width="20"
        height="12"
        viewBox="0 0 20 12"
        className={styles.arrow}
        data-ui="popover-arrow"
      >
        <path d="M0 0 10 12 20 0" />
      </svg>
    </DropdownMenu.Arrow>
  );
}
