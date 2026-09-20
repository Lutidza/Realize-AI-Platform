/**
 * @file src/components/admin/task-manager/reference/TaskHierarchyNode.component.tsx
 * @version 2.2.0
 * @date 2026-09-18
 * @description Показывает строку контейнера без рекурсивных отступов и вход в его содержимое.
 * @see documentation/specifications/task-management-execution.md
 */

import { ChevronRight, EyeOff } from "lucide-react";
import { UiButton } from "@realize/ui-kit";
import { TaskHierarchyItemMenu } from "./TaskHierarchyItemMenu.component";
import { TaskLocationMark } from "./TaskLocationMark.component";
import type { TaskHierarchyNodeProps } from "./TaskHierarchy.types";
import styles from "./TaskHierarchy.module.css";

/** Название открывает задачи; отдельная стрелка сохраняет независимый просмотр дерева. */
export function TaskHierarchyNode({
  node,
  location,
  archived,
  onSelect,
  onBrowse,
  onSettings,
  onDelete,
  onVisibility,
  canWrite,
}: TaskHierarchyNodeProps) {
  const active =
    !archived &&
    location.kind === node.location.kind &&
    location.id === node.location.id;
  const navigable = node.location.kind !== "list";
  const kindLabel =
    node.location.kind === "project"
      ? "Проект"
      : node.location.kind === "folder"
        ? "Папка"
        : "Список";
  return (
    <li className={styles.node}>
      <div
        className={styles.nodeRow}
        data-active={active}
        data-hidden={node.hidden || undefined}
        data-navigation-item="row"
      >
        <UiButton
          variant="ghost"
          className={styles.nodeSelect}
          data-navigation-item-select
          aria-current={active ? "location" : undefined}
          title={`${kindLabel}: ${node.name}`}
          aria-label={`${kindLabel}: ${node.name}`}
          onClick={() => onSelect(node.location)}
        >
          {node.hidden ? (
            <EyeOff size={18} aria-hidden="true" />
          ) : (
            <TaskLocationMark appearance={node.appearance} />
          )}
          <span className={styles.nodeName}>{node.name}</span>
          <span className={styles.count} aria-label={`Задач: ${node.count}`}>
            {node.count}
          </span>
        </UiButton>
        <TaskHierarchyItemMenu
          target={node.location}
          name={node.name}
          hidden={node.hidden}
          canWrite={canWrite}
          onSelect={onSelect}
          onSettings={onSettings}
          onDelete={onDelete}
          onVisibility={onVisibility}
        />
        {navigable && (
          <UiButton
            variant="ghost"
            size="icon"
            className={styles.contextAction}
            aria-label={`Разделы: ${node.name}`}
            title={`Разделы: ${node.name}`}
            onClick={() => onBrowse(node.location)}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </UiButton>
        )}
      </div>
    </li>
  );
}
