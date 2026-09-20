/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminPopoverArrow.types.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Определяет расположение общего указателя меню и встроенной панели навигации.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { CSSProperties } from "react";

export type SystemAdminPopoverArrowProps = {
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
};
