/**
 * @file src/components/admin/task-manager/reference/taskManager.queue.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Управляет единственным демонстрационным слотом и объяснимым ожиданием задач.
 * @see documentation/specifications/task-management-execution.md
 */
import { prototypeActors } from "./taskManager.fixtures";
import { addTaskEvent as event } from "./taskManager.activity";
import { dependencyReason, hasActiveRequest } from "./taskManager.validation";
import type {
  PrototypeState,
  PrototypeTask,
  RunCommand,
} from "./taskManager.types";
const priorities = { urgent: 0, high: 1, normal: 2, low: 3 };

function hasAgent(task: PrototypeTask): boolean {
  return [...task.roles.executor, ...task.coexecutorIds].some((id) =>
    prototypeActors.some((actor) => actor.id === id && actor.kind === "agent"),
  );
}

/** Только queued/blocked остаются заявками; paused и terminal не перезапускаются от чужого события. */
export function advanceQueue(state: PrototypeState) {
  let running = state.tasks.find((task) => task.run.state === "running");
  const waiting = state.tasks
    .filter(
      (task) =>
        !task.archived && ["queued", "blocked"].includes(task.run.state),
    )
    .sort((a, b) => priorities[a.priority] - priorities[b.priority]);

  for (const task of waiting) {
    const blocker =
      dependencyReason(state.tasks, task) ??
      (!hasAgent(task)
        ? "Назначьте агента исполнителем или соисполнителем для демонстрационного запуска."
        : undefined);
    if (blocker) {
      if (task.run.state !== "blocked" || task.run.reason !== blocker)
        event(task, blocker, "Демо-очередь");
      task.run = { ...task.run, state: "blocked", reason: blocker };
    } else if (running) {
      task.run = {
        ...task.run,
        state: "queued",
        reason: `Единственный демонстрационный слот занят задачей ${running.id}.`,
      };
    } else {
      task.run = { state: "running", attempt: task.run.attempt + 1 };
      task.status = "in_progress";
      event(
        task,
        `Демонстрационная попытка ${task.run.attempt} начата. Реальный AI не запускается.`,
        "Демо-очередь",
      );
      running = task;
    }
  }
}

export function applyRun(
  state: PrototypeState,
  task: PrototypeTask,
  command: RunCommand,
): string {
  if (task.archived) return "Восстановите задачу из архива перед запуском.";
  const current = task.run.state;
  if (command === "enqueue" || command === "retry" || command === "resume") {
    if (task.status === "done")
      return "Сначала переоткройте завершённую задачу.";
    if (command === "resume" && current !== "paused")
      return "Продолжить можно только приостановленное выполнение.";
    if (command === "retry" && !["failed", "cancelled"].includes(current))
      return "Повтор доступен после ошибки или отмены.";
    if (command === "enqueue" && !["idle", "succeeded"].includes(current))
      return "Задача уже имеет запрос на выполнение; используйте доступное действие.";
    task.run = {
      ...task.run,
      state: "queued",
      reason: "Проверяется готовность демонстрационной очереди.",
    };
    event(
      task,
      command === "resume"
        ? "Запрошено продолжение демонстрации."
        : command === "retry"
          ? "Запрошена новая попытка."
          : "Отправлено в демонстрационную очередь.",
    );
    advanceQueue(state);
    return "";
  }
  if (command === "pause") {
    if (!["running", "queued", "blocked"].includes(current))
      return "Приостановить можно активное или ожидающее выполнение.";
    task.run = {
      ...task.run,
      state: "paused",
      reason: "Приостановлено пользователем; демонстрационный слот освобождён.",
    };
    event(task, "Демонстрационное выполнение приостановлено.");
  } else if (command === "cancel") {
    if (!hasActiveRequest(task))
      return "Нет активного запроса на выполнение для отмены.";
    task.run = {
      ...task.run,
      state: "cancelled",
      reason: "Отменено пользователем. История попытки сохранена.",
    };
    if (task.status === "in_progress") task.status = "ready";
    event(
      task,
      "Демонстрационное выполнение отменено; прежние материалы сохранены.",
    );
  } else {
    if (current !== "running")
      return "Завершить можно только выполняющуюся демонстрационную попытку.";
    task.run = {
      ...task.run,
      state: command === "complete" ? "succeeded" : "failed",
      reason:
        command === "fail"
          ? "Смоделирована ошибка выполнения. Проверьте задание и повторите попытку."
          : undefined,
    };
    task.status = "review";
    event(
      task,
      command === "complete"
        ? "Демонстрационная попытка завершена. Результат передан на проверку; задача ещё не принята."
        : "Смоделирована ошибка выполнения. Требуется проверка и новая попытка.",
      "Демо-очередь",
    );
  }
  advanceQueue(state);
  return "";
}
