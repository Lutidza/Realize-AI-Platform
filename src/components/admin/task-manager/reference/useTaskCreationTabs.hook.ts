/**
 * @file src/components/admin/task-manager/reference/useTaskCreationTabs.hook.ts
 * @version 1.0.0
 * @date 2026-09-19
 * @description Защищает заполненную форму при смене типа создаваемого объекта.
 * @see documentation/specifications/task-management.md
 */
import { useState } from "react";
import type {
  TaskCreationKind,
  TaskCreationTabsProps,
} from "./TaskCreation.types";

export function useTaskCreationTabs({
  kind,
  dirty,
  onKindChange,
}: TaskCreationTabsProps) {
  const [pending, setPending] = useState<TaskCreationKind | null>(null);
  const change = (value: string) => {
    if (value === kind) return;
    if (dirty) setPending(value as TaskCreationKind);
    else onKindChange(value as TaskCreationKind);
  };
  return {
    pending,
    change,
    cancel: () => setPending(null),
    discard: () => {
      if (pending) onKindChange(pending);
    },
  };
}
