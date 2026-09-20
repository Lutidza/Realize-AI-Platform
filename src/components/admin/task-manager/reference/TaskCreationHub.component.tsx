/**
 * @file src/components/admin/task-manager/reference/TaskCreationHub.component.tsx
 * @version 1.0.0
 * @date 2026-09-19
 * @description Подключает формы существующих сущностей к единому окну создания из шапки.
 * @see documentation/specifications/task-management.md
 */
import type { ReactNode } from "react";
import { TaskCreateDialog } from "./TaskCreateDialog.component";
import { TaskHierarchyCreateDialog } from "./TaskHierarchyCreateDialog.component";
import { WorkspaceCreateDialog } from "./WorkspaceCreateDialog.component";
import { TaskCreationTabs } from "./TaskCreationTabs.component";
import { getTaskCreationContext } from "./taskCreation.selectors";
import { prototypeActors } from "./taskManager.fixtures";
import type { TaskCreationHubProps } from "./TaskCreation.types";

/** Каждый редактор сохраняет собственные draft, validation и close guard. */
export function TaskCreationHub(props: TaskCreationHubProps) {
  const { state, kind, theme, dispatch, onClose, onCreated } = props;
  const context = getTaskCreationContext(state, props.location);
  const renderCreation = (content: ReactNode, dirty: boolean) => (
    <TaskCreationTabs
      kind={kind}
      onKindChange={props.onKindChange}
      locale={props.locale}
      theme={theme}
      dirty={dirty}
    >
      {content}
    </TaskCreationTabs>
  );
  const shared = { theme, dispatch, onClose, renderCreation };
  if (kind === "workspace")
    return (
      <WorkspaceCreateDialog
        {...shared}
        onCreated={(id) => onCreated({ kind: "workspace", id })}
      />
    );
  if (kind === "task")
    return (
      <TaskCreateDialog
        {...shared}
        kind="task"
        hierarchy={context.hierarchy}
        projectId={context.projectId}
        listId={context.listId}
        actors={prototypeActors}
        tasks={state.tasks.filter((task) =>
          context.hierarchy.lists.some((list) => list.id === task.listId),
        )}
        conversations={state.conversations}
        onCreated={(id, _projectId, listId) =>
          onCreated({ kind: "list", id: listId }, id)
        }
      />
    );
  const location =
    kind === "project"
      ? { kind, workspaceId: context.workspaceId }
      : kind === "folder"
        ? { kind, projectId: context.projectId, parentId: context.folderId }
        : { kind, projectId: context.projectId, folderId: context.folderId };
  return (
    <TaskHierarchyCreateDialog
      key={kind}
      {...shared}
      location={location}
      state={state}
      onCreated={onCreated}
    />
  );
}
