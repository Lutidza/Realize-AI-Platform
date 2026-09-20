/**
 * @file src/components/admin/task-manager/reference/TaskChecklistEditor.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Редактирует именованные рабочие списки, порядок и назначения пунктов.
 * @see documentation/specifications/task-management.md
 */

import { UiButton, UiInput, UiSelect } from "@realize/ui-kit";
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from "lucide-react";
import type { TaskChecklistEditorProps } from "./TaskComposer.types";
import type { TaskChecklist, TaskChecklistItem } from "./taskManager.types";
import { moveDraftItem } from "./taskComposer.order";
import styles from "./TaskDraftEditor.module.css";

/** Изменяется только переданный draft: промежуточные пустые пункты не попадают в модель. */
export function TaskChecklistEditor({
  value,
  actors,
  fieldErrors,
  onChange,
}: TaskChecklistEditorProps) {
  const updateList = (id: string, patch: Partial<TaskChecklist>) =>
    onChange(
      value.map((list) => (list.id === id ? { ...list, ...patch } : list)),
    );
  const updateItem = (
    list: TaskChecklist,
    id: string,
    patch: Partial<TaskChecklistItem>,
  ) =>
    updateList(list.id, {
      items: list.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <h3>Рабочие чеклисты</h3>
          <p>
            Назначайте людей и агентов на отдельные пункты. Обязательные пункты
            влияют на приёмку.
          </p>
        </div>
        <ListChecks size={20} />
      </div>
      {!value.length && (
        <p className={styles.empty}>Разбейте работу на проверяемые шаги.</p>
      )}
      {value.map((list, listIndex) => (
        <article key={list.id} className={styles.checklist}>
          <header className={styles.listHeading}>
            <UiInput
              aria-label={`Название чеклиста ${listIndex + 1}`}
              value={list.title}
              placeholder="Название чеклиста"
              onChange={(event) =>
                updateList(list.id, { title: event.target.value })
              }
              aria-invalid={Boolean(
                fieldErrors[`checklists.${listIndex}.title`],
              )}
            />
            <span className={styles.counter}>
              {list.items.filter((item) => item.done).length}/
              {list.items.length}
            </span>
            <div className={styles.rowActions}>
              <UiButton
                type="button"
                size="icon"
                variant="ghost"
                disabled={listIndex === 0}
                aria-label={`Чеклист ${listIndex + 1}: выше`}
                onClick={() => onChange(moveDraftItem(value, listIndex, -1))}
              >
                <ArrowUp size={14} />
              </UiButton>
              <UiButton
                type="button"
                size="icon"
                variant="ghost"
                disabled={listIndex === value.length - 1}
                aria-label={`Чеклист ${listIndex + 1}: ниже`}
                onClick={() => onChange(moveDraftItem(value, listIndex, 1))}
              >
                <ArrowDown size={14} />
              </UiButton>
              <UiButton
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Удалить чеклист ${listIndex + 1}`}
                onClick={() =>
                  onChange(value.filter((item) => item.id !== list.id))
                }
              >
                <Trash2 size={15} />
              </UiButton>
            </div>
          </header>
          {fieldErrors[`checklists.${listIndex}.title`] && (
            <p className={styles.error}>
              {fieldErrors[`checklists.${listIndex}.title`]}
            </p>
          )}
          <progress
            className={styles.progress}
            value={list.items.filter((item) => item.done).length}
            max={list.items.length || 1}
            aria-label={`Прогресс: ${list.title || "чеклист"}`}
          />
          {list.items.map((item, index) => {
            const path = `checklists.${listIndex}.items.${index}`;
            const label = `${list.title || `Чеклист ${listIndex + 1}`}, пункт ${index + 1}`;
            return (
              <div key={item.id} className={styles.checklistItem}>
                <div className={styles.criterionRow}>
                  <input
                    type="checkbox"
                    aria-label={`${label}: выполнен`}
                    checked={item.done}
                    onChange={(event) =>
                      updateItem(list, item.id, { done: event.target.checked })
                    }
                  />
                  <UiInput
                    aria-label={`${label}: название`}
                    value={item.title}
                    placeholder="Что нужно сделать?"
                    aria-invalid={Boolean(fieldErrors[`${path}.title`])}
                    onChange={(event) =>
                      updateItem(list, item.id, { title: event.target.value })
                    }
                  />
                  <div className={styles.rowActions}>
                    <UiButton
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={`${label}: выше`}
                      onClick={() =>
                        updateList(list.id, {
                          items: moveDraftItem(list.items, index, -1),
                        })
                      }
                    >
                      <ArrowUp size={14} />
                    </UiButton>
                    <UiButton
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={index === list.items.length - 1}
                      aria-label={`${label}: ниже`}
                      onClick={() =>
                        updateList(list.id, {
                          items: moveDraftItem(list.items, index, 1),
                        })
                      }
                    >
                      <ArrowDown size={14} />
                    </UiButton>
                    <UiButton
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`${label}: удалить`}
                      onClick={() =>
                        updateList(list.id, {
                          items: list.items.filter(
                            (entry) => entry.id !== item.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </UiButton>
                  </div>
                </div>
                {fieldErrors[`${path}.title`] && (
                  <p className={styles.error}>{fieldErrors[`${path}.title`]}</p>
                )}
                <div className={styles.itemMetadata}>
                  <label className={styles.field}>
                    <span>Исполнитель пункта</span>
                    <UiSelect
                      aria-label={`${label}: исполнитель`}
                      value={item.assigneeId ?? ""}
                      onChange={(event) =>
                        updateItem(list, item.id, {
                          assigneeId: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Не назначен</option>
                      {actors.map((actor) => (
                        <option value={actor.id} key={actor.id}>
                          {actor.name} ·{" "}
                          {actor.kind === "agent" ? "агент" : "человек"}
                        </option>
                      ))}
                    </UiSelect>
                  </label>
                  <label className={styles.field}>
                    <span>Срок пункта</span>
                    <UiInput
                      type="date"
                      aria-label={`${label}: срок`}
                      value={item.dueDate}
                      onChange={(event) =>
                        updateItem(list, item.id, {
                          dueDate: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(event) =>
                        updateItem(list, item.id, {
                          required: event.target.checked,
                        })
                      }
                    />{" "}
                    Обязательный
                  </label>
                </div>
              </div>
            );
          })}
          <UiButton
            type="button"
            variant="ghost"
            size="small"
            onClick={() =>
              updateList(list.id, {
                items: [
                  ...list.items,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    done: false,
                    assigneeId: null,
                    dueDate: "",
                    required: false,
                  },
                ],
              })
            }
          >
            <Plus size={15} /> Добавить пункт
          </UiButton>
        </article>
      ))}
      <div>
        <UiButton
          type="button"
          variant="secondary"
          size="small"
          onClick={() =>
            onChange([
              ...value,
              {
                id: crypto.randomUUID(),
                title: `Чеклист ${value.length + 1}`,
                items: [],
              },
            ])
          }
        >
          <Plus size={15} /> Добавить чеклист
        </UiButton>
      </div>
    </section>
  );
}
