/**
 * @file src/components/admin/task-manager/reference/TaskHierarchyTree.component.tsx
 * @version 2.0.0
 * @date 2026-09-18
 * @description Показывает один уровень контейнеров задач без рекурсивного сжатия строк.
 * @see documentation/specifications/task-management-execution.md
 */

import { TaskHierarchyNode } from "./TaskHierarchyNode.component";
import type { TaskHierarchyTreeProps } from "./TaskHierarchy.types";
import styles from "./TaskHierarchy.module.css";

export function TaskHierarchyTree({
  nodes,
  emptyText,
  navigationRef,
  ...interactions
}: TaskHierarchyTreeProps) {
  return (
    <nav
      aria-label="Проекты и списки задач"
      className={styles.tree}
      ref={navigationRef}
      tabIndex={-1}
    >
      {nodes.length ? (
        <ul className={styles.treeList}>
          {nodes.map((node) => (
            <TaskHierarchyNode
              key={`${node.location.kind}:${node.location.id}`}
              node={node}
              {...interactions}
            />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{emptyText}</p>
      )}
    </nav>
  );
}
