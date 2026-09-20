/**
 * @file src/components/admin/task-manager/reference/taskHierarchyManagement.commands.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Сохраняет настройки или атомарно удаляет ветку контейнеров локального reference.
 * @see documentation/specifications/task-management.md
 */
import { getLocationPath } from "./taskManager.hierarchy";
import { getHierarchyDeletion } from "./taskHierarchyManagement.selectors";
import { isTaskContainerAvatar } from "./taskContainerAvatar";
import type { TaskHierarchyManagementAction } from "./taskHierarchyManagement.types";
import type { CommandResult, PrototypeState } from "./taskManager.types";

/** Guard прав вызывается reducer до операции; отказ не публикует частичные изменения. */
export function applyHierarchyManagement(
  state: PrototypeState,
  action: TaskHierarchyManagementAction,
): CommandResult {
  const { location } = action;
  const path = getLocationPath(state, location);
  if (!path.length)
    return { ok: false, message: "Раздел больше не существует." };
  if (action.type === "hierarchy/delete") {
    const deletion = getHierarchyDeletion(state, location);
    if (deletion.reason || !deletion.parent)
      return {
        ok: false,
        message: deletion.reason || "Нельзя удалить этот раздел.",
      };
    const removed = (kind: string, id: string) =>
      deletion.locations.some((part) => part.kind === kind && part.id === id);
    state.projects = state.projects.filter(({ id }) => !removed("project", id));
    state.folders = state.folders.filter(({ id }) => !removed("folder", id));
    state.lists = state.lists.filter(({ id }) => !removed("list", id));
    state.tasks = state.tasks.filter(({ id }) => !deletion.taskIds.has(id));
    return {
      ok: true,
      message: `Удалено: «${path.at(-1)!.name}».`,
      location: deletion.parent,
      removedLocations: deletion.locations,
    };
  }
  const name = action.name.trim();
  if (action.avatar != null && !isTaskContainerAvatar(action.avatar))
    return { ok: false, message: "Выберите допустимое изображение аватарки." };
  const description = action.description.trim();
  if (!name || name.length > 100)
    return {
      ok: false,
      message: "Укажите название длиной от 1 до 100 символов.",
      fieldErrors: { name: "Проверьте название." },
    };
  if (description.length > 600)
    return {
      ok: false,
      message: "Описание должно содержать не более 600 символов.",
    };
  const records = {
    project: state.projects,
    folder: state.folders,
    list: state.lists,
  }[location.kind];
  const parent = path.at(-2);
  const duplicate = records.some((item) => {
    if (
      item.id === location.id ||
      item.name.toLocaleLowerCase("ru") !== name.toLocaleLowerCase("ru")
    )
      return false;
    const otherParent = getLocationPath(state, {
      kind: location.kind,
      id: item.id,
    }).at(-2);
    return otherParent?.kind === parent?.kind && otherParent?.id === parent?.id;
  });
  if (duplicate)
    return {
      ok: false,
      message: "В этом разделе уже есть объект с таким названием.",
    };
  const record = records.find(({ id }) => id === location.id)!;
  record.name = name;
  record.description = description;
  if (action.avatar === null) delete record.avatar;
  else if (action.avatar !== undefined) record.avatar = action.avatar;
  if ("initials" in record)
    record.initials = name.slice(0, 2).toLocaleUpperCase("ru");
  return { ok: true, message: `Настройки «${name}» сохранены.`, location };
}
