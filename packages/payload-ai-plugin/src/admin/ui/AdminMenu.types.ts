/**
 * @file packages/payload-ai-plugin/src/admin/ui/AdminMenu.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт общий контракт меню Payload с визуальными примитивами UI-кита.
 */

import type { ReactNode } from "react";
export type AdminMenuProps = {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  align?: "left" | "right";
  placement?: "top" | "bottom";
  children: ReactNode;
  wide?: boolean;
};
