/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminPopoverArrow.types.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Определяет расположение общего указателя меню и встроенной панели навигации.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { CSSProperties } from "react";

export type SystemAdminPopoverArrowProps = {
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
};
