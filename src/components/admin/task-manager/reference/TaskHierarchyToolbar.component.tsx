/**
 * @file src/components/admin/task-manager/reference/TaskHierarchyToolbar.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Сохраняет высоту строки контекста при входе в проект, папку и возврате.
 * @see documentation/architecture/system-admin-shell.md
 */
import { ArrowLeft, FolderKanban } from "lucide-react";
import { UiButton } from "@realize/ui-kit";
import { TaskHierarchyItemMenu } from "./TaskHierarchyItemMenu.component";
import type { TaskHierarchyToolbarProps } from "./TaskHierarchy.types";
import styles from "./TaskHierarchy.module.css";

export function TaskHierarchyToolbar({
  context,
  parent,
  onBrowse,
  ...actions
}: TaskHierarchyToolbarProps) {
  return (
    <div
      className={styles.context}
      data-navigation-item="row"
      data-hierarchy-context
    >
      {parent ? (
        <UiButton
          variant="ghost"
          size="icon"
          className={styles.contextAction}
          aria-label={
            parent.kind === "workspace"
              ? "Все проекты"
              : `Назад: ${parent.name}`
          }
          title={
            parent.kind === "workspace"
              ? "Все проекты"
              : `Назад: ${parent.name}`
          }
          onClick={() => onBrowse(parent)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </UiButton>
      ) : (
        <span className={styles.contextIcon}>
          <FolderKanban size={16} aria-hidden="true" />
        </span>
      )}
      {context && context.kind !== "workspace" ? (
        <>
          <UiButton
            variant="ghost"
            className={styles.contextOpen}
            data-navigation-item-select
            title={context.name}
            aria-label={`Открыть: ${context.name}`}
            onClick={() => actions.onSelect(context)}
          >
            <span>{context.name}</span>
          </UiButton>
          <TaskHierarchyItemMenu
            target={context}
            name={context.name}
            {...actions}
          />
        </>
      ) : (
        <span className={styles.contextLabel}>Все проекты</span>
      )}
    </div>
  );
}
