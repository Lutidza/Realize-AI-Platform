/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminDisclosureIcon.types.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Определяет направление и состояние складывающейся стрелки навигации.
 * @see documentation/architecture/system-admin-shell.md
 */
export type SystemAdminDisclosureIconProps = {
  expanded: boolean;
  direction?: "down" | "right";
  doubled?: boolean;
  size?: number;
  className?: string;
};
