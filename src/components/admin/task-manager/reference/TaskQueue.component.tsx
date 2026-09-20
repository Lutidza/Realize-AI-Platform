/**
 * @file src/components/admin/task-manager/reference/TaskQueue.component.tsx
 * @version 1.1.0
 * @date 2026-09-17
 * @description Объясняет состояние локальной очереди и даёт явные команды симуляции.
 */

import {
  Bot,
  CircleCheck,
  CirclePause,
  Play,
  RotateCcw,
  Square,
  Workflow,
  X,
} from "lucide-react";
import { UiBadge, UiButton, UiNotice } from "@realize/ui-kit";
import type { RunCommand } from "./taskManager.types";
import type { TaskQueueProps } from "./TaskWorkbench.types";
import { TaskParticipants, TaskRunBadge } from "./TaskParticipants.component";
import styles from "./TaskQueue.module.css";

export function TaskQueue({
  tasks,
  state,
  actors,
  dispatch,
  onOpenTask,
}: TaskQueueProps) {
  const running = state.tasks.filter((task) => task.run.state === "running");
  return (
    <div className={styles.queue}>
      <div className={styles.queueIntro}>
        <div>
          <span className={styles.eyebrow}>ЦЕНТР ИСПОЛНЕНИЯ</span>
          <h2>У каждого ожидания есть причина</h2>
          <p>
            Один общий слот агента. Результат выполнения отдельно от приёмки
            задачи.
          </p>
        </div>
        <UiBadge tone={running.length ? "positive" : "neutral"} dot>
          {running.length} / 1 слот занят
        </UiBadge>
      </div>
      <UiNotice>
        Симуляция: команды ниже меняют только демонстрационные данные. Реальные
        агенты и процессы не запускаются.
      </UiNotice>
      <div className={styles.agentStrip}>
        {actors
          .filter((actor) => actor.kind === "agent")
          .map((actor) => {
            const active = running.find((task) =>
              [...task.roles.executor, ...task.coexecutorIds].includes(
                actor.id,
              ),
            );
            return (
              <div className={styles.agentTile} key={actor.id}>
                <Bot size={19} />
                <div>
                  <strong>{actor.name}</strong>
                  <small>
                    {active ? `Выполняет ${active.id}` : actor.specialty}
                  </small>
                </div>
                <span className={styles.agentDot} data-busy={Boolean(active)} />
              </div>
            );
          })}
      </div>
      <div className={styles.queueList}>
        {tasks.map((task) => {
          const command = (value: RunCommand) =>
            dispatch({ type: "task/run", taskId: task.id, command: value });
          const active = ["queued", "blocked", "running", "paused"].includes(
            task.run.state,
          );
          return (
            <article key={task.id} className={styles.queueItem}>
              <div className={styles.queueTask}>
                <Workflow size={19} />
                <div>
                  <UiButton
                    variant="ghost"
                    className={styles.queueTitle}
                    onClick={() => onOpenTask(task.id)}
                  >
                    {task.title}
                  </UiButton>
                  <small>
                    {task.id} ·{" "}
                    {
                      state.projects.find(
                        (project) => project.id === task.projectId,
                      )?.name
                    }{" "}
                    · попытка {task.run.attempt}
                  </small>
                </div>
                <TaskRunBadge state={task.run.state} />
              </div>
              <p className={styles.queueReason}>
                {task.run.reason ||
                  (task.run.state === "succeeded"
                    ? "Результат передан на проверку. Задача ожидает приёмки."
                    : task.run.state === "idle"
                      ? "Задача ещё не отправлена в очередь."
                      : "Состояние демонстрационного запуска.")}
              </p>
              <div className={styles.queueBottom}>
                <span>
                  <TaskParticipants
                    ids={[...task.roles.executor, ...task.coexecutorIds]}
                    actors={actors}
                  />
                  {task.workflow}
                </span>
                <div className={styles.queueActions}>
                  {task.run.state === "idle" && (
                    <UiButton
                      size="small"
                      disabled={task.status === "done"}
                      onClick={() => command("enqueue")}
                    >
                      <Play size={13} />В очередь
                    </UiButton>
                  )}
                  {task.run.state === "running" && (
                    <>
                      <UiButton
                        size="small"
                        variant="secondary"
                        onClick={() => command("pause")}
                      >
                        <CirclePause size={14} />
                        Пауза
                      </UiButton>
                      <UiButton
                        size="small"
                        onClick={() => command("complete")}
                      >
                        <CircleCheck size={14} />
                        Результат готов
                      </UiButton>
                      <UiButton
                        size="small"
                        variant="ghost"
                        onClick={() => command("fail")}
                      >
                        <X size={14} />
                        Сбой
                      </UiButton>
                    </>
                  )}
                  {task.run.state === "paused" && (
                    <UiButton size="small" onClick={() => command("resume")}>
                      <Play size={13} />
                      Продолжить
                    </UiButton>
                  )}
                  {["failed", "cancelled"].includes(task.run.state) && (
                    <UiButton
                      size="small"
                      variant="secondary"
                      onClick={() => command("retry")}
                    >
                      <RotateCcw size={14} />
                      Повторить
                    </UiButton>
                  )}
                  {active && (
                    <UiButton
                      size="small"
                      variant="ghost"
                      onClick={() => command("cancel")}
                    >
                      <Square size={12} />
                      Отменить
                    </UiButton>
                  )}
                  {task.run.state === "succeeded" && (
                    <UiButton
                      size="small"
                      variant="secondary"
                      onClick={() => onOpenTask(task.id)}
                    >
                      Проверить задачу
                    </UiButton>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!tasks.length && (
          <p className={styles.empty}>
            Нет задач, подходящих под выбранные фильтры.
          </p>
        )}
      </div>
    </div>
  );
}
