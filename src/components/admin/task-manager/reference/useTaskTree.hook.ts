/**
 * @file src/components/admin/task-manager/reference/useTaskTree.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Хранит режим и раскрытие подзадач для списка и таблицы.
 */

import { useState } from "react";
import { getTaskTreeRows } from "./taskManager.tree";
import type { PrototypeTask } from "./taskManager.types";

export function useTaskTree(
  tasks: PrototypeTask[],
  allTasks: PrototypeTask[],
  filtered: boolean,
) {
  const [nested, setNested] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = getTaskTreeRows(tasks, allTasks, collapsed, filtered);
  const toggle = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { nested, setNested, rows, toggle };
}
