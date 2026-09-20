/**
 * @file src/components/admin/task-manager/reference/TaskParticipants.component.tsx
 * @version 1.1.0
 * @date 2026-09-17
 * @description Показывает участников и состояния демонстрационного исполнения.
 */

import { Bot } from "lucide-react";
import { UiBadge } from "@realize/ui-kit";
import type { PrototypeActor, RunState } from "./taskManager.types";
import type {
  TaskParticipantsProps,
  TaskRunBadgeProps,
} from "./TaskWorkbench.types";
import styles from "./TaskParticipants.module.css";

export const runLabels: Record<RunState, string> = {
  idle: "Не запущено",
  queued: "В очереди",
  blocked: "Блокировка",
  running: "Выполняется",
  paused: "На паузе",
  succeeded: "Результат готов",
  failed: "Ошибка",
  cancelled: "Отменено",
};

/** Люди и агенты имеют разные подписи; аватар не заменяет доступное имя. */
export function TaskParticipants({ ids, actors }: TaskParticipantsProps) {
  const members = ids
    .map((id) => actors.find((actor) => actor.id === id))
    .filter((actor): actor is PrototypeActor => Boolean(actor));
  return (
    <span
      className={styles.participants}
      aria-label={
        members.map((actor) => actor.name).join(", ") ||
        "Исполнитель не назначен"
      }
    >
      {members.slice(0, 3).map((actor) => (
        <span
          key={actor.id}
          className={styles.avatar}
          data-agent={actor.kind === "agent"}
          title={`${actor.name} · ${actor.kind === "agent" ? "AI агент" : "Человек"}`}
        >
          {actor.kind === "agent" ? (
            <Bot size={14} aria-hidden="true" />
          ) : (
            actor.initials
          )}
        </span>
      ))}
      {members.length > 3 && (
        <span className={styles.avatar}>+{members.length - 3}</span>
      )}
      {members.length === 0 && <span className={styles.muted}>—</span>}
    </span>
  );
}

export function TaskRunBadge({ state }: TaskRunBadgeProps) {
  return (
    <UiBadge
      className={styles.runBadge}
      tone={
        state === "blocked" || state === "failed"
          ? "danger"
          : state === "succeeded"
            ? "positive"
            : "neutral"
      }
      dot
    >
      {runLabels[state]}
    </UiBadge>
  );
}
