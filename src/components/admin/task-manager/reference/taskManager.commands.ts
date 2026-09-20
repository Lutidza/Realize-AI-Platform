/**
 * @file src/components/admin/task-manager/reference/taskManager.commands.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Применяет атомарные изменения полных задач, архива и групповых операций.
 * @see documentation/specifications/task-management-execution.md
 */
import { addTaskEvent } from "./taskManager.activity";
import { taskStatuses } from "./taskManager.fixtures";
import { normalizeTaskDraft, taskToDraft } from "./taskManager.draft";
import { hasActiveRequest, validateTaskDraft } from "./taskManager.validation";
import type {
  CommandResult,
  PrototypeAction,
  PrototypeState,
  PrototypeTask,
  TaskDraft,
} from "./taskManager.types";

function nextTaskId(state: PrototypeState): string {
  return `TM-${Math.max(100, ...state.tasks.map((task) => Number(task.id.replace("TM-", "")) || 0)) + 1}`;
}

/** Изменяет только рабочую копию; reducer публикует её после успешного результата. */
export function saveTaskDraft(
  state: PrototypeState,
  input: TaskDraft,
  taskId?: string,
  eventText?: string,
): CommandResult {
  const draft = normalizeTaskDraft(input);
  const fieldErrors = validateTaskDraft(state, draft, taskId);
  if (Object.keys(fieldErrors).length)
    return { ok: false, message: Object.values(fieldErrors)[0], fieldErrors };
  const previous = state.tasks.find((task) => task.id === taskId);
  const id = previous?.id ?? nextTaskId(state);
  const previousRelated = previous?.related ?? [];
  const task: PrototypeTask = previous ?? {
    ...draft,
    id,
    archived: false,
    run: { state: "idle", attempt: 0 },
    activity: [],
    artifacts: [
      {
        id: `${id}-brief`,
        path: "TASK.md",
        version: 1,
        content: `# ${id}: ${draft.title}\n\n${draft.description || "Уточните описание и критерии перед выполнением."}`,
      },
    ],
  };
  Object.assign(task, draft);
  if (!previous) state.tasks.push(task);
  for (const target of state.tasks) {
    const wasLinked = previousRelated.includes(target.id);
    const linked = draft.related.includes(target.id);
    if (wasLinked === linked) continue;
    target.related = linked
      ? [...new Set([...target.related, id])]
      : target.related.filter((value) => value !== id);
    addTaskEvent(target, `${linked ? "Добавлена" : "Удалена"} связь с ${id}.`);
  }
  addTaskEvent(
    task,
    previous
      ? (eventText ?? "Изменения задачи сохранены.")
      : "Создана задача с указанными участниками и материалами.",
  );
  return {
    ok: true,
    message: previous
      ? `Изменения ${id} сохранены в прототипе.`
      : `Создана задача ${id}.`,
    taskId: id,
  };
}

function archiveReason(
  state: PrototypeState,
  task: PrototypeTask,
  archived: boolean,
): string | undefined {
  if (task.archived === archived)
    return archived ? "Задача уже в архиве." : "Задача уже активна.";
  if (hasActiveRequest(task))
    return "Сначала завершите или отмените запрос на выполнение.";
  if (task.handoff?.state === "pending")
    return "Сначала примите или отклоните передачу задачи.";
  if (archived) {
    if (
      state.tasks.some((child) => child.parentId === task.id && !child.archived)
    )
      return "Сначала архивируйте подзадачи или выберите всё дерево.";
    if (
      state.tasks.some(
        (dependent) =>
          !dependent.archived &&
          dependent.status !== "done" &&
          dependent.dependsOn.includes(task.id),
      )
    )
      return "Задача нужна активной зависимой работе. Архивируйте связанные работы одной группой.";
  } else if (task.parentId) {
    const parent = state.tasks.find((item) => item.id === task.parentId);
    if (!parent || parent.archived)
      return "Сначала восстановите родителя или выберите всю цепочку.";
    if (parent.status === "done" && task.status !== "done")
      return "Переоткройте родителя перед восстановлением незавершённой подзадачи.";
  }
  if (
    !archived &&
    task.dependsOn.some((id) =>
      state.tasks.some(
        (item) => item.id === id && item.archived && item.status !== "done",
      ),
    )
  )
    return "Сначала восстановите незавершённые зависимости или выберите всю цепочку.";
  return undefined;
}

/** Проверка видит конечное состояние группы, поэтому порядок выбора детей и родителей не влияет. */
export function archiveTasks(
  state: PrototypeState,
  ids: string[],
  archived: boolean,
): CommandResult {
  const selected = state.tasks.filter((task) => ids.includes(task.id));
  if (!ids.length || selected.length !== ids.length)
    return { ok: false, message: "Выберите существующие задачи." };
  const candidate = structuredClone(state);
  for (const task of candidate.tasks)
    if (ids.includes(task.id)) task.archived = archived;
  for (const task of selected) {
    const reason = archiveReason(candidate, task, archived);
    if (reason) return { ok: false, message: `${task.id}: ${reason}` };
  }
  for (const task of selected) {
    task.archived = archived;
    addTaskEvent(
      task,
      archived
        ? "Задача помещена в архив. История и связи сохранены."
        : "Задача восстановлена из архива.",
    );
  }
  return {
    ok: true,
    message: `${archived ? "Архивировано" : "Восстановлено"} задач: ${ids.length}.`,
    taskId: ids.length === 1 ? ids[0] : undefined,
  };
}

export function duplicateTask(
  state: PrototypeState,
  task: PrototypeTask,
): CommandResult {
  const draft = taskToDraft(task);
  const id = nextTaskId(state);
  draft.title = `${task.title.slice(0, 151)} (копия)`;
  draft.status = "backlog";
  draft.parentId = null;
  // Копия сохраняет задание, но не выдаёт ссылки на прежний результат за новый результат.
  draft.gitLinks = [];
  draft.criteria = draft.criteria.map((item, index) => ({
    ...item,
    id: `${id}-criterion-${index}`,
    done: false,
  }));
  draft.checklists = draft.checklists.map((list, listIndex) => ({
    ...list,
    id: `${id}-list-${listIndex}`,
    items: list.items.map((item, index) => ({
      ...item,
      id: `${id}-list-${listIndex}-item-${index}`,
      done: false,
    })),
  }));
  const result = saveTaskDraft(state, draft);
  if (result.ok)
    addTaskEvent(
      state.tasks.find((item) => item.id === result.taskId)!,
      `Создана копия задания ${task.id}; результаты и выполнение не перенесены.`,
    );
  return result;
}

export function applyBulk(
  state: PrototypeState,
  action: Extract<PrototypeAction, { type: "task/bulk" }>,
): CommandResult {
  const ids = [...new Set(action.taskIds)];
  if (action.operation !== "status")
    return archiveTasks(state, ids, action.operation === "archive");
  if (
    !action.status ||
    !ids.length ||
    ids.some((id) => !state.tasks.some((task) => task.id === id))
  )
    return { ok: false, message: "Выберите задачи и целевой статус." };
  const candidate = structuredClone(state);
  for (const task of candidate.tasks)
    if (ids.includes(task.id)) task.status = action.status;
  for (const id of ids) {
    const original = state.tasks.find((task) => task.id === id)!;
    const target = candidate.tasks.find((task) => task.id === id)!;
    const context = {
      ...candidate,
      tasks: candidate.tasks.map((task) => (task.id === id ? original : task)),
    };
    const fieldErrors = validateTaskDraft(context, taskToDraft(target), id);
    if (Object.keys(fieldErrors).length)
      return {
        ok: false,
        message: `${id}: ${Object.values(fieldErrors)[0]}`,
        fieldErrors,
      };
  }
  for (const task of state.tasks)
    if (ids.includes(task.id)) {
      task.status = action.status;
      const label =
        taskStatuses.find((item) => item.value === action.status)?.label ??
        action.status;
      addTaskEvent(task, `Статус изменён групповой командой: ${label}.`);
    }
  return { ok: true, message: `Обновлено задач: ${ids.length}.` };
}
