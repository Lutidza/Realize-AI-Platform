/**
 * @file src/components/admin/task-manager/reference/taskWorkspace.commands.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Применяет проверенные изменения настроек, членства и архива рабочих сред.
 * @see documentation/specifications/task-management-execution.md
 */

import { prototypeActors } from "./taskManager.fixtures";
import { getLocationTasks } from "./taskManager.hierarchy";
import { getWorkspaceAccess } from "./taskWorkspace.access";
import { workspaceColors, workspaceIcons } from "./taskWorkspace.constants";
import type { CommandResult, PrototypeState } from "./taskManager.types";
import type { WorkspaceAction, WorkspaceDraft } from "./taskWorkspace.types";

const fail = (
  message: string,
  fieldErrors?: Record<string, string>,
): CommandResult => ({ ok: false, message, fieldErrors });

function validate(
  state: PrototypeState,
  draft: WorkspaceDraft,
  id?: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  if (!name || name.length > 100)
    errors.name = "Введите название от 1 до 100 символов.";
  if (
    state.workspaces.some(
      (entry) =>
        entry.id !== id &&
        entry.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"),
    )
  )
    errors.name = "Рабочая среда с таким названием уже существует.";
  if (draft.description.trim().length > 600)
    errors.description = "Описание не должно превышать 600 символов.";
  if (!workspaceColors.some((entry) => entry.value === draft.color))
    errors.color = "Выберите цвет.";
  if (!Object.hasOwn(workspaceIcons, draft.icon))
    errors.icon = "Выберите значок.";
  if (!["private", "internal"].includes(draft.visibility))
    errors.visibility = "Выберите режим доступа.";
  try {
    new Intl.DateTimeFormat("ru", { timeZone: draft.timezone }).format();
  } catch {
    errors.timezone = "Укажите существующий часовой пояс.";
  }
  if (!draft.timezone.trim()) errors.timezone = "Выберите часовой пояс.";
  if (
    !draft.workingDays.length ||
    new Set(draft.workingDays).size !== draft.workingDays.length ||
    draft.workingDays.some(
      (day) => !Number.isInteger(day) || day < 1 || day > 7,
    )
  )
    errors.workingDays = "Выберите хотя бы один рабочий день.";
  return errors;
}

/** Metadata-команды не управляют очередью; reducer публикует результат атомарно. */
export function applyWorkspaceCommand(
  state: PrototypeState,
  action: WorkspaceAction,
): CommandResult {
  if (!prototypeActors.some((actor) => actor.id === state.currentActorId))
    return fail("Пользователь рабочей среды не найден.");
  const workspace =
    "workspaceId" in action
      ? state.workspaces.find((entry) => entry.id === action.workspaceId)
      : undefined;
  if (action.type !== "workspace/create") {
    if (!workspace || !getWorkspaceAccess(state, workspace).canManage)
      return fail("Нет доступа к управлению рабочей средой.");
    if (workspace.revision !== action.expectedRevision)
      return fail(
        "Среда уже изменена. Обновите данные перед сохранением; ваш ввод сохранён.",
      );
    if (workspace.archived && action.type !== "workspace/archive")
      return fail("Восстановите рабочую среду перед изменением настроек.");
  }
  const now = new Date().toISOString();
  if (action.type === "workspace/create" || action.type === "workspace/save") {
    const errors = validate(state, action.draft, workspace?.id);
    if (Object.keys(errors).length)
      return fail("Проверьте поля рабочей среды.", errors);
    const draft = {
      ...action.draft,
      name: action.draft.name.trim(),
      description: action.draft.description.trim(),
      workingDays: [...action.draft.workingDays].sort((a, b) => a - b),
    };
    const initials = draft.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toLocaleUpperCase("ru");
    if (action.type === "workspace/create") {
      let index = 1;
      while (state.workspaces.some((entry) => entry.id === `w-${index}`))
        index += 1;
      const id = `w-${index}`;
      state.workspaces.push({
        ...draft,
        id,
        initials,
        ownerId: state.currentActorId,
        members: [],
        archived: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });
      return {
        ok: true,
        message: `Создана рабочая среда «${draft.name}».`,
        location: { kind: "workspace", id },
      };
    }
    Object.assign(workspace!, draft, { initials });
  } else if (action.type === "workspace/member") {
    if (action.actorId === workspace!.ownerId)
      return fail("Роль владельца нельзя изменить через список участников.");
    if (!prototypeActors.some((actor) => actor.id === action.actorId))
      return fail("Участник не найден.");
    if (
      action.role !== null &&
      !["admin", "member", "guest"].includes(action.role)
    )
      return fail("Выберите роль участника.");
    if (action.role === null || action.role === "guest") {
      const involved = getLocationTasks(state, {
        kind: "workspace",
        id: workspace!.id,
      }).some(
        (task) =>
          ["queued", "blocked", "running", "paused"].includes(task.run.state) &&
          [...Object.values(task.roles).flat(), ...task.coexecutorIds].includes(
            action.actorId,
          ),
      );
      if (involved)
        return fail(
          "Участник связан с незавершённым запуском. Сначала завершите или отмените его.",
        );
    }
    workspace!.members = workspace!.members.filter(
      (entry) => entry.actorId !== action.actorId,
    );
    if (action.role)
      workspace!.members.push({ actorId: action.actorId, role: action.role });
  } else if (action.type === "workspace/archive") {
    if (action.archived === workspace!.archived)
      return fail(
        action.archived ? "Среда уже в архиве." : "Среда уже активна.",
      );
    const active = getLocationTasks(state, {
      kind: "workspace",
      id: workspace!.id,
    }).filter((task) =>
      ["queued", "blocked", "running", "paused"].includes(task.run.state),
    );
    if (action.archived && active.length)
      return fail(
        `Есть незавершённые запуски: ${active.length}. Завершите или отмените их перед архивированием.`,
      );
    workspace!.archived = action.archived;
  }
  workspace!.revision += 1;
  workspace!.updatedAt = now;
  return {
    ok: true,
    message:
      action.type === "workspace/archive"
        ? action.archived
          ? "Рабочая среда архивирована."
          : "Рабочая среда восстановлена. Запуски не изменены."
        : "Изменения рабочей среды сохранены.",
  };
}
