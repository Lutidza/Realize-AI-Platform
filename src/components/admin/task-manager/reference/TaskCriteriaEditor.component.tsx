/**
 * @file src/components/admin/task-manager/reference/TaskCriteriaEditor.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Редактирует критерии приёмки в общем черновике задачи.
 * @see documentation/specifications/task-management.md
 */

import { UiButton, UiInput } from "@realize/ui-kit";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { TaskCriteriaEditorProps } from "./TaskComposer.types";
import { moveDraftItem } from "./taskComposer.order";
import styles from "./TaskDraftEditor.module.css";

export function TaskCriteriaEditor({
  value,
  fieldErrors,
  onChange,
}: TaskCriteriaEditorProps) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <h3>Критерии приёмки</h3>
          <p>Все критерии должны быть выполнены перед принятием задачи.</p>
        </div>
        <span className={styles.counter}>
          {value.filter((item) => item.done).length}/{value.length}
        </span>
      </div>
      {!value.length && (
        <p className={styles.empty}>
          Опишите результат, по которому можно принять работу.
        </p>
      )}
      {value.map((item, index) => (
        <div key={item.id}>
          <div className={styles.criterionRow}>
            <input
              type="checkbox"
              aria-label={`Выполнен критерий ${index + 1}`}
              checked={item.done}
              onChange={(event) =>
                onChange(
                  value.map((criterion) =>
                    criterion.id === item.id
                      ? { ...criterion, done: event.target.checked }
                      : criterion,
                  ),
                )
              }
            />
            <UiInput
              aria-label={`Критерий ${index + 1}`}
              placeholder="Как проверяем результат?"
              value={item.title}
              aria-invalid={Boolean(fieldErrors[`criteria.${index}.title`])}
              onChange={(event) =>
                onChange(
                  value.map((criterion) =>
                    criterion.id === item.id
                      ? { ...criterion, title: event.target.value }
                      : criterion,
                  ),
                )
              }
            />
            <div className={styles.rowActions}>
              <UiButton
                type="button"
                size="icon"
                variant="ghost"
                disabled={index === 0}
                aria-label={`Критерий ${index + 1}: выше`}
                onClick={() => onChange(moveDraftItem(value, index, -1))}
              >
                <ArrowUp size={14} />
              </UiButton>
              <UiButton
                type="button"
                size="icon"
                variant="ghost"
                disabled={index === value.length - 1}
                aria-label={`Критерий ${index + 1}: ниже`}
                onClick={() => onChange(moveDraftItem(value, index, 1))}
              >
                <ArrowDown size={14} />
              </UiButton>
              <UiButton
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Удалить критерий ${index + 1}`}
                onClick={() =>
                  onChange(
                    value.filter((criterion) => criterion.id !== item.id),
                  )
                }
              >
                <Trash2 size={14} />
              </UiButton>
            </div>
          </div>
          {fieldErrors[`criteria.${index}.title`] && (
            <p className={styles.error}>
              {fieldErrors[`criteria.${index}.title`]}
            </p>
          )}
        </div>
      ))}
      <div>
        <UiButton
          type="button"
          variant="secondary"
          size="small"
          onClick={() =>
            onChange([
              ...value,
              { id: crypto.randomUUID(), title: "", done: false },
            ])
          }
        >
          <Plus size={15} /> Добавить критерий
        </UiButton>
      </div>
    </section>
  );
}
