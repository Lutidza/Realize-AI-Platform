/**
 * @file src/components/admin/task-manager/reference/taskManager.validation.ts
 * @version 2.0.0
 * @date 2026-09-18
 * @description Проверяет целостность полного черновика, дерева, критериев и безопасных Git-ссылок.
 * @see documentation/specifications/task-management-execution.md
 */

import {
  prototypeActors,
  taskPriorities,
  taskStatuses,
} from "./taskManager.fixtures";
import { taskToDraft } from "./taskManager.draft";
import { getLocationPath } from "./taskManager.hierarchy";
import type {
  PrototypeState,
  PrototypeTask,
  TaskDraft,
} from "./taskManager.types";

export function hasActiveRequest(task: PrototypeTask): boolean {
  return ["running", "paused", "queued", "blocked"].includes(task.run.state);
}

export function dependencyReason(
  tasks: PrototypeTask[],
  task: Pick<PrototypeTask, "dependsOn">,
): string | undefined {
  const pending = task.dependsOn.filter(
    (id) => tasks.find((item) => item.id === id)?.status !== "done",
  );
  return pending.length
    ? `Ожидает завершения зависимостей: ${pending.join(", ")}.`
    : undefined;
}

export function completionReason(
  tasks: PrototypeTask[],
  task: PrototypeTask,
): string | undefined {
  if (hasActiveRequest(task))
    return "Сначала завершите или отмените запрос на выполнение.";
  const dependency = dependencyReason(tasks, task);
  if (dependency) return dependency;
  if (task.criteria.some((item) => !item.done))
    return "Выполните все критерии перед принятием задачи.";
  if (
    task.checklists.some((list) =>
      list.items.some((item) => item.required && !item.done),
    )
  )
    return "Выполните обязательные пункты чеклистов перед принятием задачи.";
  if (
    tasks.some(
      (child) =>
        child.parentId === task.id &&
        !child.archived &&
        child.status !== "done",
    )
  )
    return "Завершите активные подзадачи перед принятием родительской задачи.";
  return undefined;
}

function validDate(value: string): boolean {
  if (value === "") return true;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function safeURL(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function changed(
  before: TaskDraft,
  after: TaskDraft,
  keys: (keyof TaskDraft)[],
): boolean {
  return keys.some(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

/** Учитывает и явные dependencies, и ожидание родителем незавершённых дочерних работ. */
function hasGraphCycle(tasks: PrototypeTask[]): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const task = tasks.find((item) => item.id === id);
    const edges = [
      ...(task?.dependsOn ?? []),
      ...tasks
        .filter((item) => item.parentId === id && !item.archived)
        .map((item) => item.id),
    ];
    if (edges.some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return tasks.some((task) => visit(task.id));
}

/** Возвращает ошибки до записи: даже неверная последняя связь отменяет весь draft. */
export function validateTaskDraft(
  state: PrototypeState,
  draft: TaskDraft,
  taskId?: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const previous = state.tasks.find((task) => task.id === taskId);
  const validActor = (id: string) =>
    prototypeActors.some((actor) => actor.id === id);
  if (!state.projects.some((project) => project.id === draft.projectId))
    errors.projectId = "Выберите существующий проект.";
  const list = state.lists.find((item) => item.id === draft.listId);
  if (
    !list ||
    list.projectId !== draft.projectId ||
    !getLocationPath(state, { kind: "list", id: draft.listId }).length
  )
    errors.listId = "Выберите существующий список выбранного проекта.";
  if (!draft.title.trim() || draft.title.length > 160)
    errors.title = "Укажите название длиной от 1 до 160 символов.";
  if (!taskStatuses.some((item) => item.value === draft.status))
    errors.status = "Выберите допустимый статус.";
  if (!taskId && !["backlog", "ready"].includes(draft.status))
    errors.status = "Новую задачу можно добавить в бэклог или к выполнению.";
  if (!taskPriorities.some((item) => item.value === draft.priority))
    errors.priority = "Выберите допустимый приоритет.";
  if (!["task", "bug", "milestone"].includes(draft.taskType))
    errors.taskType = "Выберите тип задачи.";
  if (!["manual", "staged", "automatic"].includes(draft.mode))
    errors.mode = "Выберите режим выполнения.";
  if (!validDate(draft.startDate))
    errors.startDate = "Укажите корректную дату начала.";
  if (!validDate(draft.dueDate)) errors.dueDate = "Укажите корректный срок.";
  if (draft.startDate && draft.dueDate && draft.startDate > draft.dueDate)
    errors.dueDate = "Срок не может быть раньше начала.";
  if (
    draft.estimateMinutes !== null &&
    (!Number.isFinite(draft.estimateMinutes) ||
      draft.estimateMinutes < 0 ||
      !Number.isInteger(draft.estimateMinutes))
  )
    errors.estimateMinutes =
      "Оценка задаётся целым неотрицательным числом минут.";
  for (const role of ["requester", "executor", "tester", "observer"] as const) {
    if (draft.roles[role].some((id) => !validActor(id)))
      errors[`roles.${role}`] = "Выберите существующего участника.";
  }
  if (draft.coexecutorIds.some((id) => !validActor(id)))
    errors.coexecutorIds = "Один из соисполнителей недоступен.";
  if (draft.coexecutorIds.some((id) => draft.roles.executor.includes(id)))
    errors.coexecutorIds =
      "Исполнитель уже назначен: не дублируйте его среди соисполнителей.";
  for (const key of ["dependsOn", "related"] as const) {
    if (
      draft[key].some(
        (id) => id === taskId || !state.tasks.some((task) => task.id === id),
      )
    )
      errors[key] = "Выберите другие существующие задачи.";
  }
  if (
    draft.dependsOn.some((id) =>
      state.tasks.some(
        (task) => task.id === id && task.archived && task.status !== "done",
      ),
    )
  )
    errors.dependsOn =
      "Восстановите незавершённую задачу из архива перед добавлением зависимости.";
  if (
    draft.conversationIds.some(
      (id) =>
        !state.conversations.some((conversation) => conversation.id === id),
    )
  )
    errors.conversationIds = "Один из выбранных диалогов недоступен.";

  if (draft.parentId) {
    const parent = state.tasks.find((task) => task.id === draft.parentId);
    if (
      !parent ||
      parent.id === taskId ||
      parent.projectId !== draft.projectId ||
      parent.listId !== draft.listId ||
      parent.archived
    )
      errors.parentId =
        "Родитель должен быть активной задачей того же проекта и списка.";
    else if (
      parent.status === "done" &&
      (previous?.parentId !== parent.id || draft.status !== "done")
    )
      errors.parentId =
        "Переоткройте родителя перед добавлением незавершённой подзадачи.";
    const parents = new Set(taskId ? [taskId] : []);
    let cursor: string | null = draft.parentId;
    while (cursor) {
      if (parents.has(cursor)) {
        errors.parentId = "Родительская связь создаёт цикл.";
        break;
      }
      parents.add(cursor);
      cursor = state.tasks.find((task) => task.id === cursor)?.parentId ?? null;
    }
  }
  if (
    taskId &&
    state.tasks.some(
      (child) =>
        child.parentId === taskId && child.projectId !== draft.projectId,
    )
  )
    errors.projectId =
      "Сначала перенесите дочерние задачи: дерево должно остаться в одном проекте.";
  if (
    taskId &&
    state.tasks.some(
      (child) => child.parentId === taskId && child.listId !== draft.listId,
    )
  )
    errors.listId =
      "Нельзя переносить родителя отдельно от подзадач: дерево должно остаться в одном списке.";

  const ids = new Set<string>();
  function checkID(id: string, path: string) {
    if (!id.trim() || ids.has(id))
      errors[path] =
        "Идентификатор должен быть непустым и уникальным в задаче.";
    ids.add(id);
  }
  draft.criteria.forEach((item, index) => {
    checkID(item.id, `criteria.${index}.id`);
    if (!item.title.trim())
      errors[`criteria.${index}.title`] = "Заполните название критерия.";
  });
  draft.checklists.forEach((list, listIndex) => {
    checkID(list.id, `checklists.${listIndex}.id`);
    if (!list.title.trim())
      errors[`checklists.${listIndex}.title`] = "Заполните название чеклиста.";
    list.items.forEach((item, itemIndex) => {
      const path = `checklists.${listIndex}.items.${itemIndex}`;
      checkID(item.id, `${path}.id`);
      if (!item.title.trim())
        errors[`${path}.title`] = "Заполните текст пункта.";
      if (item.assigneeId !== null && !validActor(item.assigneeId))
        errors[`${path}.assigneeId`] = "Исполнитель пункта недоступен.";
      if (!validDate(item.dueDate))
        errors[`${path}.dueDate`] = "Укажите корректный срок пункта.";
    });
  });
  draft.gitLinks.forEach((link, index) => {
    const path = `gitLinks.${index}`;
    checkID(link.id, `${path}.id`);
    if (!link.label.trim())
      errors[`${path}.label`] = "Укажите название Git-связи.";
    if (!safeURL(link.url))
      errors[`${path}.url`] =
        "Допустима абсолютная ссылка http(s) без логина и пароля.";
    if (
      ![
        "branch",
        "commit",
        "push",
        "pull_request",
        "build",
        "release",
      ].includes(link.kind)
    )
      errors[`${path}.kind`] = "Выберите тип Git-связи.";
    if (!["manual", "demo"].includes(link.source))
      errors[`${path}.source`] =
        "Источник ссылки должен быть ручным или демонстрационным.";
    if (!["unverified", "succeeded", "failed", "pending"].includes(link.status))
      errors[`${path}.status`] = "Укажите допустимое состояние ссылки.";
    if (link.source === "manual" && link.status !== "unverified")
      errors[`${path}.status`] =
        "Ручная ссылка не подтверждает успех: используйте «Не проверено».";
  });

  if (previous) {
    const before = taskToDraft(previous);
    if (previous.archived)
      errors.task = "Восстановите задачу из архива перед редактированием.";
    if (
      previous.status === "done" &&
      draft.status === "done" &&
      changed(before, draft, Object.keys(before) as (keyof TaskDraft)[])
    )
      errors.status =
        "Переоткройте задачу перед изменением принятого результата.";
    if (["running", "paused"].includes(previous.run.state)) {
      if (
        changed(before, draft, [
          "projectId",
          "listId",
          "parentId",
          "workflow",
          "profile",
          "mode",
          "dependsOn",
          "coexecutorIds",
        ]) ||
        JSON.stringify(before.roles.executor) !==
          JSON.stringify(draft.roles.executor)
      )
        errors.execution =
          "Остановите текущую попытку перед изменением конфигурации, связей или исполнителей.";
      if (previous.run.state === "running" && draft.status !== previous.status)
        errors.status =
          "Сначала завершите или отмените текущую демонстрационную попытку.";
    }
    if (
      previous.status === "done" &&
      draft.status !== "done" &&
      state.tasks.some(
        (task) =>
          task.dependsOn.includes(previous.id) &&
          (task.status === "done" || task.run.state === "running"),
      )
    )
      errors.status =
        "Сначала остановите или переоткройте зависимую задачу: она использует принятый результат.";
  }

  const candidate: PrototypeTask = {
    ...draft,
    id: taskId ?? "__new_task__",
    archived: false,
    artifacts: [],
    activity: [],
    run: previous?.run ?? { state: "idle", attempt: 0 },
  };
  const tasks = [
    ...state.tasks.filter((task) => task.id !== taskId),
    candidate,
  ];
  if (hasGraphCycle(tasks))
    errors.dependsOn = "Зависимость или ожидание подзадачи создаёт цикл.";
  if (draft.status === "done") {
    const reason = completionReason(tasks, candidate);
    if (reason) errors.status = reason;
  }
  return errors;
}
