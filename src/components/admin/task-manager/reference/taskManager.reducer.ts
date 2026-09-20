/**
 * @file src/components/admin/task-manager/reference/taskManager.reducer.ts
 * @version 4.1.0
 * @date 2026-09-18
 * @description Атомарно применяет команды локального прототипа и публикует их проверяемый результат.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  initialPrototypeState,
  roleLabels,
  taskStatuses,
} from "./taskManager.fixtures";
import { applyWorkspaceCommand } from "./taskWorkspace.commands";
import { checkWorkspaceWrite } from "./taskWorkspace.access";
import { addTaskEvent } from "./taskManager.activity";
import {
  applyBulk,
  archiveTasks,
  duplicateTask,
  saveTaskDraft,
} from "./taskManager.commands";
import { taskToDraft } from "./taskManager.draft";
import { createHierarchyLocation } from "./taskManager.hierarchy.commands";
import { applyHierarchyManagement } from "./taskHierarchyManagement.commands";
import { applyHandoff } from "./taskManager.handoff";
import { advanceQueue, applyRun } from "./taskManager.queue";
import type {
  CommandResult,
  PrototypeAction,
  PrototypeState,
} from "./taskManager.types";

function applyCommand(
  state: PrototypeState,
  action: PrototypeAction,
): CommandResult {
  if (action.type === "reset")
    return { ok: true, message: "Демонстрационные данные восстановлены." };
  if (
    action.type === "workspace/create" ||
    action.type === "workspace/save" ||
    action.type === "workspace/member" ||
    action.type === "workspace/archive"
  )
    return applyWorkspaceCommand(state, action);
  const denied = checkWorkspaceWrite(state, action);
  if (denied) return { ok: false, message: denied };
  if (action.type === "hierarchy/create")
    return createHierarchyLocation(state, action);
  if (action.type === "hierarchy/save" || action.type === "hierarchy/delete")
    return applyHierarchyManagement(state, action);
  if (action.type === "task/create") return saveTaskDraft(state, action.draft);
  if (action.type === "task/bulk") return applyBulk(state, action);
  const task = state.tasks.find((item) => item.id === action.taskId);
  if (!task) return { ok: false, message: "Задача не найдена." };
  if (action.type === "task/archive")
    return archiveTasks(state, [task.id], action.archived);
  if (action.type === "task/duplicate") return duplicateTask(state, task);
  if (task.archived)
    return {
      ok: false,
      message: "Восстановите задачу из архива перед редактированием.",
    };
  const draft = taskToDraft(task);
  let message = "";
  switch (action.type) {
    case "task/save":
      return saveTaskDraft(state, action.draft, task.id);
    case "task/update":
      Object.assign(draft, action.patch);
      break;
    case "task/checklists":
      draft.checklists = action.checklists;
      break;
    case "task/git-links":
      draft.gitLinks = action.gitLinks;
      break;
    case "task/status": {
      if (task.status === action.status)
        return { ok: false, message: "Этот статус уже установлен." };
      draft.status = action.status;
      message = `${task.id}: ${taskStatuses.find((item) => item.value === action.status)?.label ?? action.status}.`;
      break;
    }
    case "task/role": {
      draft.roles[action.role] = action.actorIds;
      draft.coexecutorIds = draft.coexecutorIds.filter(
        (id) => !draft.roles.executor.includes(id),
      );
      message = `Обновлена роль «${roleLabels[action.role]}».`;
      break;
    }
    case "task/criterion-toggle": {
      const criterion = draft.criteria.find(
        (item) => item.id === action.itemId,
      );
      if (!criterion) return { ok: false, message: "Критерий не найден." };
      criterion.done = !criterion.done;
      message = `${criterion.done ? "Выполнен" : "Возвращён на проверку"} критерий: ${criterion.title}.`;
      break;
    }
    case "task/comment": {
      if (!action.text.trim())
        return { ok: false, message: "Введите текст комментария." };
      addTaskEvent(task, action.text.trim());
      return { ok: true, message: "Комментарий добавлен.", taskId: task.id };
    }
    case "task/link": {
      if (
        action.targetId === task.id ||
        !state.tasks.some((item) => item.id === action.targetId)
      )
        return { ok: false, message: "Выберите другую существующую задачу." };
      const key = action.kind === "related" ? "related" : "dependsOn";
      if (action.remove)
        draft[key] = draft[key].filter((id) => id !== action.targetId);
      else if (draft[key].includes(action.targetId))
        return { ok: false, message: "Такая связь уже существует." };
      else draft[key].push(action.targetId);
      message = `${action.remove ? "Удалена" : "Добавлена"} ${action.kind === "related" ? "связь" : "зависимость"}: ${action.targetId}.`;
      break;
    }
    case "task/conversation": {
      if (
        !state.conversations.some((item) => item.id === action.conversationId)
      )
        return { ok: false, message: "Диалог не найден." };
      const linked = draft.conversationIds.includes(action.conversationId);
      draft.conversationIds = linked
        ? draft.conversationIds.filter((id) => id !== action.conversationId)
        : [...draft.conversationIds, action.conversationId];
      message = `${linked ? "Отвязан" : "Привязан"} диалог: ${state.conversations.find((item) => item.id === action.conversationId)?.title}.`;
      break;
    }
    case "task/handoff":
    case "task/handoff-resolve":
      return applyHandoff(task, action);
    case "task/run": {
      const reason = applyRun(state, task, action.command);
      return reason
        ? { ok: false, message: reason }
        : {
            ok: true,
            message:
              task.run.reason ?? `${task.id}: состояние выполнения обновлено.`,
            taskId: task.id,
          };
    }
  }
  const result = saveTaskDraft(state, draft, task.id, message || undefined);
  if (result.ok && message) {
    result.message = message;
  }
  return result;
}

/** Отказ меняет только сообщение: ни частичных записей, ни скрытого продвижения очереди. */
export function prototypeReducer(
  state: PrototypeState,
  action: PrototypeAction,
): PrototypeState {
  const next = structuredClone(
    action.type === "reset" ? initialPrototypeState : state,
  );
  const result = applyCommand(next, action);
  if (!result.ok)
    return { ...state, notice: result.message, lastResult: result };
  if (action.type.startsWith("task/")) advanceQueue(next);
  return { ...next, notice: result.message, lastResult: result };
}
