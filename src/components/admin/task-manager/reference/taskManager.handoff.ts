/**
 * @file src/components/admin/task-manager/reference/taskManager.handoff.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет предложение и принятие передачи ответственности за задачу.
 * @see documentation/specifications/task-management-execution.md
 */
import { prototypeActors } from "./taskManager.fixtures";
import { addTaskEvent } from "./taskManager.activity";
import type {
  CommandResult,
  PrototypeAction,
  PrototypeTask,
} from "./taskManager.types";

export function applyHandoff(
  task: PrototypeTask,
  action: Extract<
    PrototypeAction,
    { type: "task/handoff" | "task/handoff-resolve" }
  >,
): CommandResult {
  const reject = (message: string): CommandResult => ({ ok: false, message });
  if (task.archived)
    return reject("Восстановите задачу из архива перед передачей работы.");
  if (action.type === "task/handoff") {
    if (!prototypeActors.some((actor) => actor.id === action.toActorId))
      return reject("Выберите доступного участника.");
    if (!action.scope.trim())
      return reject("Опишите передаваемую работу и ожидаемый результат.");
    if (task.handoff?.state === "pending")
      return reject("Сначала примите или отклоните текущую передачу.");
    if (
      [...task.roles.executor, ...task.coexecutorIds].includes(action.toActorId)
    )
      return reject("Этот участник уже выполняет задачу.");
    if (task.status === "done")
      return reject("Переоткройте задачу перед передачей работы.");
    task.handoff = {
      toActorId: action.toActorId,
      kind: action.kind,
      scope: action.scope.trim(),
      state: "pending",
    };
    addTaskEvent(
      task,
      `${action.kind === "transfer" ? "Предложена передача" : "Предложено делегирование"}: ${task.handoff.scope}. Назначения сохраняются до принятия.`,
    );
    return {
      ok: true,
      message: "Передача ожидает принятия получателем.",
      taskId: task.id,
    };
  }
  if (!task.handoff || task.handoff.state !== "pending")
    return reject("Нет передачи, ожидающей решения.");
  if (action.accept && task.status === "done")
    return reject("Переоткройте завершённую задачу перед принятием передачи.");
  if (
    action.accept &&
    [...task.roles.executor, ...task.coexecutorIds].includes(
      task.handoff.toActorId,
    )
  )
    return reject(
      "Получатель уже выполняет задачу. Отклоните устаревшую передачу.",
    );
  if (action.accept && ["running", "paused"].includes(task.run.state))
    return reject("Остановите активную попытку перед принятием передачи.");
  task.handoff.state = action.accept ? "accepted" : "rejected";
  if (action.accept) {
    if (task.handoff.kind === "transfer") {
      task.roles.executor = [task.handoff.toActorId];
      task.coexecutorIds = [];
    } else
      task.coexecutorIds = [
        ...new Set([...task.coexecutorIds, task.handoff.toActorId]),
      ];
  }
  addTaskEvent(
    task,
    action.accept
      ? task.handoff.kind === "transfer"
        ? "Передача принята. Исполнитель заменён; прежняя история сохранена."
        : "Делегирование принято. Соисполнитель добавлен; ведущий сохраняет ответственность."
      : "Передача отклонена. Прежние назначения сохранены.",
  );
  return {
    ok: true,
    message: action.accept ? "Передача принята." : "Передача отклонена.",
    taskId: task.id,
  };
}
