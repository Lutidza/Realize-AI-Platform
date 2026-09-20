/**
 * @file src/components/admin/task-manager/reference/useTaskHierarchyComposer.hook.ts
 * @version 2.2.0
 * @date 2026-09-19
 * @description Сохраняет черновик контейнера атомарно и защищает несохранённые поля от закрытия.
 * @see documentation/specifications/task-management.md
 */

import { useRef, useState } from "react";
import { getLocationPath } from "./taskManager.hierarchy";
import type { TaskHierarchyCreateDialogProps } from "./TaskHierarchyComposer.types";
import type { TaskLocation } from "./taskManager.types";

/** Проверка контекста и создание вложенных сущностей остаются одной командой модели. */
export function useTaskHierarchyComposer(
  props: TaskHierarchyCreateDialogProps,
) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [location, setLocation] = useState(props.location);
  const dirty =
    Boolean(name || description) ||
    JSON.stringify(location) !== JSON.stringify(props.location);
  const changeLocation = (next: typeof location) => {
    setLocation(next);
    setError("");
    setFieldErrors({});
  };
  let parentLocation: TaskLocation | null = null;
  switch (location.kind) {
    case "workspace":
      break;
    case "project":
      parentLocation = { kind: "workspace", id: location.workspaceId };
      break;
    case "folder":
      parentLocation = location.parentId
        ? { kind: "folder", id: location.parentId }
        : { kind: "project", id: location.projectId };
      break;
    case "list":
      parentLocation = location.folderId
        ? { kind: "folder", id: location.folderId }
        : { kind: "project", id: location.projectId };
  }
  const parentPath = parentLocation
    ? getLocationPath(props.state, parentLocation)
    : [];
  const parentContext = parentLocation
    ? parentPath.map((part) => part.name).join(" / ") ||
      "Родительский раздел недоступен"
    : "Таск-менеджер";
  const changeName = (value: string) => {
    setName(value);
    setError("");
    setFieldErrors({});
  };
  const changeDescription = (value: string) => {
    setDescription(value);
    setError("");
    setFieldErrors({});
  };
  const close = () => {
    if (dirty) setDiscardOpen(true);
    else props.onClose();
  };
  const save = () => {
    const result = props.dispatch({
      type: "hierarchy/create",
      location,
      name,
      description,
    });
    if (!result.ok) {
      setError(result.message);
      setFieldErrors(result.fieldErrors ?? {});
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    props.onClose();
    if (result.location) props.onCreated(result.location);
  };
  return {
    name,
    description,
    changeName,
    changeDescription,
    error,
    fieldErrors,
    errorRef,
    parentContext,
    location,
    changeLocation,
    dirty,
    discardOpen,
    setDiscardOpen,
    close,
    save,
  };
}
