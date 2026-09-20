/**
 * @file src/components/admin/task-manager/reference/useTaskHierarchyManager.hook.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Управляет черновиком настроек, подтверждением удаления и персональной видимостью контейнеров.
 * @see documentation/specifications/task-management.md
 */
import { useRef, useState } from "react";
import { getLocationInfo, getLocationPath } from "./taskManager.hierarchy";
import { getTaskLocationAppearance } from "./taskLocationAppearance";
import {
  getLocationWorkspace,
  getWorkspaceAccess,
} from "./taskWorkspace.access";
import {
  getHierarchyDeletion,
  taskLocationNavigationId,
} from "./taskHierarchyManagement.selectors";
import type { TaskLocation } from "./taskManager.types";
import type {
  ManagedTaskLocation,
  TaskHierarchyManagerProps,
} from "./taskHierarchyManagement.types";

export function useTaskHierarchyManager(props: TaskHierarchyManagerProps) {
  const { state, preferences, onPreferencesChange } = props;
  const [target, setTarget] = useState<{
    location: ManagedTaskLocation;
    mode: "settings" | "delete";
  } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<string>();
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const navigationAfterDelete = useRef<HTMLElement | null>(null);
  const deleted = useRef(false);
  const hiddenIds = preferences?.hiddenItems ?? [];
  const isHidden = (location: TaskLocation) =>
    hiddenIds.includes(taskLocationNavigationId(location));
  const publishVisibility = (location: TaskLocation, show: boolean) => {
    const key = taskLocationNavigationId(location);
    onPreferencesChange({
      ...preferences,
      order: preferences?.order ?? [],
      hidden: preferences?.hidden ?? [],
      hiddenItems: show
        ? hiddenIds.filter((id) => id !== key)
        : [...new Set([...hiddenIds, key])],
    });
  };
  const info = target ? getLocationInfo(state, target.location) : undefined;
  const access = getWorkspaceAccess(
    state,
    target ? getLocationWorkspace(state, target.location) : undefined,
  );
  const dirty = Boolean(
    target?.mode === "settings" &&
    info &&
    (name !== info.name ||
      description !== info.description ||
      avatar !== info.avatar ||
      avatarLoading ||
      visible === isHidden(target.location)),
  );
  const open = (location: TaskLocation, mode: "settings" | "delete") => {
    if (
      location.kind === "workspace" ||
      !getWorkspaceAccess(state, getLocationWorkspace(state, location)).canRead
    )
      return;
    const value = getLocationInfo(state, location);
    if (!value) return;
    const trigger = document.activeElement;
    navigationAfterDelete.current =
      trigger instanceof HTMLElement
        ? (trigger
            .closest("[data-task-hierarchy]")
            ?.querySelector<HTMLElement>('nav[tabindex="-1"]') ?? null)
        : null;
    deleted.current = false;
    setTarget({ location: location as ManagedTaskLocation, mode });
    setName(value.name);
    setDescription(value.description);
    setAvatar(value.avatar);
    setAvatarLoading(false);
    setVisible(!isHidden(location));
    setError("");
    setDiscardOpen(false);
  };
  const close = () => {
    setTarget(null);
    setDiscardOpen(false);
    setError("");
  };
  const save = () => {
    if (!target || !info || !access.canRead || avatarLoading) return;
    if (
      name !== info.name ||
      description !== info.description ||
      avatar !== info.avatar
    ) {
      const result = props.dispatch({
        type: "hierarchy/save",
        location: target.location,
        name,
        description,
        avatar: avatar ?? null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
    }
    publishVisibility(target.location, visible);
    close();
  };
  const remove = () => {
    if (!target) return;
    const result = props.dispatch({
      type: "hierarchy/delete",
      location: target.location,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const removed = result.removedLocations ?? [];
    const keys = new Set(removed.map(taskLocationNavigationId));
    onPreferencesChange({
      ...preferences,
      order: preferences?.order ?? [],
      hidden: preferences?.hidden ?? [],
      favorites: preferences?.favorites?.filter((id) => !keys.has(id)),
      hiddenItems: hiddenIds.filter((id) => !keys.has(id)),
    });
    deleted.current = true;
    close();
    if (result.location) props.onDeleted(result.location, removed);
  };
  return {
    target,
    info,
    access,
    name,
    description,
    avatar,
    setAvatar,
    avatarLoading,
    setAvatarLoading,
    appearance: target
      ? getTaskLocationAppearance(state, target.location)
      : undefined,
    visible,
    error,
    dirty,
    discardOpen,
    setDiscardOpen,
    setName,
    setDescription,
    setVisible,
    hiddenIds,
    isHidden,
    toggleVisibility: (location: TaskLocation) =>
      publishVisibility(location, isHidden(location)),
    edit: (location: TaskLocation) => open(location, "settings"),
    requestDelete: (location: TaskLocation) => open(location, "delete"),
    requestClose: () => (dirty ? setDiscardOpen(true) : close()),
    close,
    save,
    remove,
    onDeleteCloseAutoFocus: (event: Event) => {
      if (!deleted.current || !navigationAfterDelete.current?.isConnected)
        return;
      deleted.current = false;
      event.preventDefault();
      // Удалённой кнопки больше нет: клавиатура возвращается в обновлённую навигацию.
      requestAnimationFrame(() =>
        navigationAfterDelete.current?.focus({ preventScroll: true }),
      );
    },
    path: target
      ? getLocationPath(state, target.location)
          .map((part) => part.name)
          .join(" / ")
      : "",
    deletion:
      target?.mode === "delete"
        ? getHierarchyDeletion(state, target.location)
        : null,
  };
}
