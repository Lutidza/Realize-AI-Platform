/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminMenuContent.types.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Сохраняет контракт Radix Content у общего анимированного меню.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { ComponentProps } from "react";
import type { Content } from "@radix-ui/react-dropdown-menu";

export type SystemAdminMenuContentProps = Omit<
  ComponentProps<typeof Content>,
  "ref"
>;
