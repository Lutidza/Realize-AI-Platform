/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminDisclosureIcon.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Складывает сегменты Lucide-стрелки вместо поворота всей иконки.
 * @see documentation/architecture/system-admin-shell.md
 */
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsRight,
} from "lucide-react";
import type { SystemAdminDisclosureIconProps } from "./SystemAdminDisclosureIcon.types";
import styles from "./SystemAdminDisclosureIcon.module.css";

export function SystemAdminDisclosureIcon({
  expanded,
  direction = "down",
  doubled = false,
  size = 16,
  className,
}: SystemAdminDisclosureIconProps) {
  const Icon =
    direction === "down"
      ? doubled
        ? ChevronsDown
        : ChevronDown
      : doubled
        ? ChevronsRight
        : ChevronRight;
  return (
    <Icon
      size={size}
      aria-hidden="true"
      className={[styles.icon, className].filter(Boolean).join(" ")}
      data-expanded={expanded}
      data-direction={direction}
    />
  );
}
