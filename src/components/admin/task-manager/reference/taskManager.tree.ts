/**
 * @file src/components/admin/task-manager/reference/taskManager.tree.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Строит строки дерева задач с контекстом родителей и отдельным статусом корня.
 * @see documentation/specifications/task-management.md
 */

import type { PrototypeTask } from "./taskManager.types";
import type { TaskTreeRow } from "./TaskWorkbench.types";

/** Родители из контекста поиска видимы, но не становятся результатами или bulk-целями. */
export function getTaskTreeRows(
  tasks: PrototypeTask[],
  allTasks: PrototypeTask[],
  collapsed: ReadonlySet<string> = new Set(),
  filtered = false,
): TaskTreeRow[] {
  const matched = new Set(tasks.map((task) => task.id));
  const byId = new Map(allTasks.map((task) => [task.id, task]));
  const included = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    const visited = new Set([task.id]);
    let parent = task.parentId ? byId.get(task.parentId) : undefined;
    while (
      parent &&
      !visited.has(parent.id) &&
      parent.archived === task.archived &&
      parent.listId === task.listId
    ) {
      included.set(parent.id, parent);
      visited.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }
  const children = new Map<string, PrototypeTask[]>();
  const roots: PrototypeTask[] = [];
  for (const task of included.values()) {
    if (task.parentId && included.has(task.parentId)) {
      const siblings = children.get(task.parentId) ?? [];
      siblings.push(task);
      children.set(task.parentId, siblings);
    } else roots.push(task);
  }
  const rows: TaskTreeRow[] = [];
  const visited = new Set<string>();
  const visit = (
    task: PrototypeTask,
    depth: number,
    rootStatus: PrototypeTask["status"],
  ) => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    const descendants = children.get(task.id) ?? [];
    const expanded =
      descendants.length > 0 && (filtered || !collapsed.has(task.id));
    rows.push({
      task,
      depth,
      rootStatus,
      contextOnly: !matched.has(task.id),
      childCount: descendants.length,
      expanded,
    });
    if (expanded)
      for (const child of descendants) visit(child, depth + 1, rootStatus);
  };
  for (const task of roots) visit(task, 0, task.status);
  return rows;
}
