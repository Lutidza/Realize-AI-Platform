/**
 * @file src/components/admin/task-manager/reference/TaskDetailExecution.component.tsx
 * @version 1.1.0
 * @date 2026-09-17
 * @description Показывает демонстрационный запуск и отдельное принятие передачи работы.
 * @see documentation/specifications/task-management.md
 */

"use client";

import { useState } from "react";
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSelect,
  UiTextarea,
} from "@realize/ui-kit";
import { Bot, Users } from "lucide-react";
import type { PrototypeTask } from "./taskManager.types";
import type { TaskExecutionProps } from "./TaskDetail.types";
import styles from "./TaskDetailSections.module.css";

const runLabels: Record<PrototypeTask["run"]["state"], string> = {
  idle: "Не запущено",
  queued: "В очереди",
  blocked: "Заблокировано",
  running: "Выполняется",
  paused: "На паузе",
  succeeded: "Исполнение завершено",
  failed: "Ошибка",
  cancelled: "Отменено",
};

/** Передача фиксирует адресата и scope; принятие является отдельным действием демонстрационной модели. */
export function TaskExecution({ task, actors, dispatch }: TaskExecutionProps) {
  const [toActorId, setToActorId] = useState("");
  const [kind, setKind] = useState<"transfer" | "delegate">("delegate");
  const [scope, setScope] = useState("");
  const active = ["queued", "running", "paused", "blocked"].includes(
    task.run.state,
  );
  const receiver = actors.find((actor) => actor.id === task.handoff?.toActorId);
  return (
    <div className={styles.stack}>
      <section className={styles.section}>
        <div className={styles.headingRow}>
          <h3>
            <Bot size={18} aria-hidden="true" /> Исполнение
          </h3>
          <UiBadge
            tone={
              task.run.state === "failed" || task.run.state === "blocked"
                ? "danger"
                : task.run.state === "succeeded"
                  ? "positive"
                  : "neutral"
            }
          >
            {runLabels[task.run.state]}
          </UiBadge>
        </div>
        <p className={styles.muted}>
          {task.run.attempt
            ? `Попытка ${task.run.attempt} · ${task.workflow}`
            : "Запуск проверит назначения, критерии и зависимости."}
        </p>
        {task.run.reason && <UiNotice>{task.run.reason}</UiNotice>}
        <div className={styles.actions}>
          {!active && (
            <UiButton
              onClick={() =>
                dispatch({
                  type: "task/run",
                  taskId: task.id,
                  command: ["failed", "cancelled"].includes(task.run.state)
                    ? "retry"
                    : "enqueue",
                })
              }
            >
              {["failed", "cancelled"].includes(task.run.state)
                ? "Повторить запуск"
                : "Поставить в очередь"}
            </UiButton>
          )}
          {["queued", "running"].includes(task.run.state) && (
            <UiButton
              variant="secondary"
              onClick={() =>
                dispatch({
                  type: "task/run",
                  taskId: task.id,
                  command: "pause",
                })
              }
            >
              Приостановить
            </UiButton>
          )}
          {task.run.state === "paused" && (
            <UiButton
              onClick={() =>
                dispatch({
                  type: "task/run",
                  taskId: task.id,
                  command: "resume",
                })
              }
            >
              Продолжить
            </UiButton>
          )}
          {active && (
            <UiButton
              variant="ghost"
              onClick={() =>
                dispatch({
                  type: "task/run",
                  taskId: task.id,
                  command: "cancel",
                })
              }
            >
              Отменить запуск
            </UiButton>
          )}
        </div>
        <p className={styles.muted}>
          Демонстрация очереди. Реальные агенты и внешние операции не
          запускаются.
        </p>
      </section>
      <section className={styles.section}>
        <h3>
          <Users size={17} aria-hidden="true" /> Передача работы
        </h3>
        <p className={styles.muted}>
          Делегируйте часть работы или предложите передать ответственность
          другому участнику.
        </p>
        {task.handoff && (
          <div className={styles.handoff}>
            <div className={styles.headingRow}>
              <strong>
                {task.handoff.kind === "delegate"
                  ? "Делегирование"
                  : "Передача"}{" "}
                → {receiver?.name ?? task.handoff.toActorId}
              </strong>
              <UiBadge>
                {task.handoff.state === "pending"
                  ? "Ждёт принятия"
                  : task.handoff.state === "accepted"
                    ? "Принято"
                    : "Отклонено"}
              </UiBadge>
            </div>
            <p>{task.handoff.scope}</p>
            {task.handoff.state === "pending" && (
              <>
                <p className={styles.muted}>Действие адресата в прототипе</p>
                <div className={styles.actions}>
                  <UiButton
                    size="small"
                    onClick={() =>
                      dispatch({
                        type: "task/handoff-resolve",
                        taskId: task.id,
                        accept: true,
                      })
                    }
                  >
                    Принять работу
                  </UiButton>
                  <UiButton
                    size="small"
                    variant="secondary"
                    onClick={() =>
                      dispatch({
                        type: "task/handoff-resolve",
                        taskId: task.id,
                        accept: false,
                      })
                    }
                  >
                    Отклонить
                  </UiButton>
                </div>
              </>
            )}
          </div>
        )}
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            if (!toActorId || !scope.trim()) return;
            const result = dispatch({
              type: "task/handoff",
              taskId: task.id,
              toActorId,
              kind,
              scope: scope.trim(),
            });
            if (result.ok) setScope("");
          }}
        >
          <div className={styles.twoColumns}>
            <label>
              Действие
              <UiSelect
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                <option value="delegate">Делегировать часть</option>
                <option value="transfer">Передать задачу</option>
              </UiSelect>
            </label>
            <label>
              Участник
              <UiSelect
                required
                value={toActorId}
                onChange={(event) => setToActorId(event.target.value)}
              >
                <option value="">Человек или агент</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name} ·{" "}
                    {actor.kind === "agent" ? "агент" : "человек"}
                  </option>
                ))}
              </UiSelect>
            </label>
          </div>
          <label>
            Объём и ожидаемый результат
            <UiTextarea
              rows={3}
              value={scope}
              required
              maxLength={1500}
              placeholder="Например: проверить мобильную версию и приложить скриншоты"
              onChange={(event) => setScope(event.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <UiButton
              type="submit"
              variant="secondary"
              disabled={
                !toActorId || !scope.trim() || task.handoff?.state === "pending"
              }
            >
              Отправить предложение
            </UiButton>
          </div>
        </form>
      </section>
    </div>
  );
}
