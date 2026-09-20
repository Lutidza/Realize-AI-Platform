/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminDisclosureIcon.types.ts
 * @version 1.0.0
 * @date 2026-09-18
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
