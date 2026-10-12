/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminMenuContent.types.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Сохраняет контракт Radix Content у общего анимированного меню.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { ComponentProps } from "react";
import type { Content } from "@radix-ui/react-dropdown-menu";

export type SystemAdminMenuContentProps = Omit<
  ComponentProps<typeof Content>,
  "ref"
>;
