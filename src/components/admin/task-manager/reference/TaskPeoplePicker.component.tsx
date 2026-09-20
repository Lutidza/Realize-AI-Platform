/**
 * @file src/components/admin/task-manager/reference/TaskPeoplePicker.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Компактно выбирает несколько людей и агентов с поиском и клавиатурным закрытием.
 * @see documentation/specifications/task-management.md
 */

import { UiInput } from "@realize/ui-kit";
import { Bot, ChevronDown, Search, UserRound } from "lucide-react";
import type { TaskPeoplePickerProps } from "./TaskComposer.types";
import { useTaskPeoplePicker } from "./useTaskPeoplePicker.hook";
import styles from "./TaskPeoplePicker.module.css";

/** Список остаётся в текущем диалоге, поэтому не нарушает его focus trap или тему. */
export function TaskPeoplePicker({
  label,
  actors,
  value,
  onChange,
}: TaskPeoplePickerProps) {
  const { root, open, query, setQuery, placement, toggle } =
    useTaskPeoplePicker();
  const selected = actors.filter((actor) => value.includes(actor.id));
  return (
    <details ref={root} open={open} className={styles.picker}>
      <summary
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          toggle();
        }}
      >
        <span className={styles.selection}>
          {selected.length ? (
            <>
              <span className={styles.avatars}>
                {selected.slice(0, 3).map((actor) => (
                  <span key={actor.id} data-kind={actor.kind}>
                    {actor.initials}
                  </span>
                ))}
              </span>
              <span>
                {selected.length === 1
                  ? selected[0].name
                  : `${selected.length} участников`}
              </span>
            </>
          ) : (
            <>
              <UserRound size={15} aria-hidden="true" />
              <span className={styles.muted}>Не назначены</span>
            </>
          )}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div
        className={styles.popover}
        data-placement={placement.side}
        style={{ maxHeight: placement.maxHeight }}
      >
        <div className={styles.search}>
          <Search size={15} aria-hidden="true" />
          <UiInput
            aria-label={`Поиск: ${label}`}
            placeholder="Найти участника…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className={styles.options} aria-label={label}>
          {actors
            .filter((actor) =>
              `${actor.name} ${actor.specialty}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((actor) => (
              <label key={actor.id} className={styles.option}>
                <input
                  type="checkbox"
                  checked={value.includes(actor.id)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, actor.id]
                        : value.filter((id) => id !== actor.id),
                    )
                  }
                />
                <span className={styles.avatar} data-kind={actor.kind}>
                  {actor.kind === "agent" ? (
                    <Bot size={16} aria-hidden="true" />
                  ) : (
                    actor.initials
                  )}
                </span>
                <span>
                  <strong>{actor.name}</strong>
                  <small>
                    {actor.kind === "agent" ? "AI-агент" : "Человек"} ·{" "}
                    {actor.specialty}
                  </small>
                </span>
              </label>
            ))}
          {!actors.some((actor) =>
            `${actor.name} ${actor.specialty}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          ) && <p className={styles.empty}>Участники не найдены</p>}
        </div>
        <div className={styles.hint}>Можно выбрать нескольких участников</div>
      </div>
    </details>
  );
}
