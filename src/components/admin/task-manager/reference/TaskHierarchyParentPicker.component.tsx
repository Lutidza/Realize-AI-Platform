/**
 * @file src/components/admin/task-manager/reference/TaskHierarchyParentPicker.component.tsx
 * @version 1.0.0
 * @date 2026-09-19
 * @description Показывает рабочую среду, проект и папку до создания контейнера.
 * @see documentation/specifications/task-management.md
 */
import { UiSelect } from "@realize/ui-kit";
import type { TaskHierarchyParentPickerProps } from "./TaskCreation.types";
import { getTaskCreationContext } from "./taskCreation.selectors";
import { getLocationPath } from "./taskManager.hierarchy";
import styles from "./TaskDraftEditor.module.css";

export function TaskHierarchyParentPicker({
  state,
  location,
  onChange,
}: TaskHierarchyParentPickerProps) {
  if (location.kind === "workspace") return null;
  const { hierarchy } = getTaskCreationContext(state, {
    kind: "workspace",
    id: "",
  });
  const name = (kind: "project" | "folder", id: string) =>
    getLocationPath(hierarchy, { kind, id })
      .map((item) => item.name)
      .join(" / ");
  if (location.kind === "project")
    return (
      <label className={styles.field}>
        <span>Рабочая среда</span>
        <UiSelect
          aria-label="Рабочая среда проекта"
          value={location.workspaceId}
          onChange={(event) =>
            onChange({ kind: "project", workspaceId: event.target.value })
          }
        >
          <option value="">Выберите рабочую среду</option>
          {hierarchy.workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </UiSelect>
      </label>
    );
  return (
    <div className={styles.twoColumns}>
      <label className={styles.field}>
        <span>Проект</span>
        <UiSelect
          aria-label="Проект расположения"
          value={location.projectId}
          onChange={(event) =>
            onChange(
              location.kind === "folder"
                ? {
                    kind: "folder",
                    projectId: event.target.value,
                    parentId: null,
                  }
                : {
                    kind: "list",
                    projectId: event.target.value,
                    folderId: null,
                  },
            )
          }
        >
          <option value="">Выберите проект</option>
          {hierarchy.projects.map((item) => (
            <option key={item.id} value={item.id}>
              {name("project", item.id)}
            </option>
          ))}
        </UiSelect>
      </label>
      <label className={styles.field}>
        <span>Родительская папка</span>
        <UiSelect
          aria-label="Родительская папка"
          value={
            (location.kind === "folder"
              ? location.parentId
              : location.folderId) ?? ""
          }
          disabled={!location.projectId}
          onChange={(event) =>
            onChange(
              location.kind === "folder"
                ? { ...location, parentId: event.target.value || null }
                : { ...location, folderId: event.target.value || null },
            )
          }
        >
          <option value="">В корне проекта</option>
          {hierarchy.folders
            .filter((item) => item.projectId === location.projectId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {name("folder", item.id)}
              </option>
            ))}
        </UiSelect>
      </label>
    </div>
  );
}
