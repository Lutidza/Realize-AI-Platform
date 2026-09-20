/**
 * @file src/components/admin/task-manager/reference/TaskLocationMark.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Передаёт визуальную идентичность контейнера в общий UiEntityMark.
 * @see documentation/architecture/system-admin-shell.md
 */
import { UiEntityMark } from "@realize/ui-kit";
import type { TaskLocationMarkProps } from "./TaskHierarchy.types";

export function TaskLocationMark({ appearance, size }: TaskLocationMarkProps) {
  const { Icon, ...mark } = appearance;
  return (
    <UiEntityMark
      {...mark}
      size={size}
      icon={
        <Icon
          size={size === "medium" ? 22 : 14}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      }
    />
  );
}
