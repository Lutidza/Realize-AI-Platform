/**
 * @file src/components/admin/task-manager/reference/TaskDraftRelations.component.tsx
 * @version 1.1.0
 * @date 2026-09-18
 * @description Выбирает связи задач и диалоги до атомарного сохранения черновика.
 * @see documentation/specifications/task-management.md
 */

import type { TaskDraftEditorProps } from "./TaskComposer.types";
import { getLocationPath } from "./taskManager.hierarchy";
import styles from "./TaskDraftEditor.module.css";

export function TaskDraftRelations({
  draft,
  taskId,
  tasks,
  hierarchy,
  conversations,
  fieldErrors,
  onChange,
}: Pick<
  TaskDraftEditorProps,
  | "draft"
  | "taskId"
  | "tasks"
  | "hierarchy"
  | "conversations"
  | "fieldErrors"
  | "onChange"
>) {
  const candidates = tasks.filter(
    (task) => task.id !== taskId && !task.archived,
  );
  return (
    <div className={styles.stack}>
      <p className={styles.callout}>
        Зависимость удерживает запуск до завершения другой задачи. Обычная связь
        объединяет контекст; диалог сохраняет историю обсуждения.
      </p>
      <div className={styles.twoColumns}>
        {(
          [
            {
              key: "dependsOn",
              title: "Зависит от",
              hint: "Без результата этих задач работа не начнётся.",
            },
            {
              key: "related",
              title: "Связанные задачи",
              hint: "Контекст без ограничения порядка выполнения.",
            },
          ] as const
        ).map((group) => (
          <section className={styles.section} key={group.key}>
            <div className={styles.sectionHeading}>
              <div>
                <h3>{group.title}</h3>
                <p>{group.hint}</p>
              </div>
              <span className={styles.counter}>{draft[group.key].length}</span>
            </div>
            <div className={styles.selectionList}>
              {candidates.map((task) => (
                <label className={styles.selectionRow} key={task.id}>
                  <input
                    type="checkbox"
                    checked={draft[group.key].includes(task.id)}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        [group.key]: event.target.checked
                          ? [...draft[group.key], task.id]
                          : draft[group.key].filter((id) => id !== task.id),
                      })
                    }
                  />
                  <span>
                    <small>{task.id}</small>
                    <span>{task.title}</span>
                    <small>
                      {getLocationPath(hierarchy, {
                        kind: "list",
                        id: task.listId,
                      })
                        .map((part) => part.name)
                        .join(" / ")}
                    </small>
                  </span>
                </label>
              ))}
              {!candidates.length && (
                <p className={styles.empty}>Других активных задач пока нет.</p>
              )}
            </div>
            {fieldErrors[group.key] && (
              <p className={styles.error}>{fieldErrors[group.key]}</p>
            )}
          </section>
        ))}
      </div>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <h3>Диалоги</h3>
            <p>Выберите обсуждения, в которых решается задача.</p>
          </div>
          <span className={styles.counter}>{draft.conversationIds.length}</span>
        </div>
        <div className={styles.selectionList}>
          {conversations.map((conversation) => (
            <label className={styles.selectionRow} key={conversation.id}>
              <input
                type="checkbox"
                checked={draft.conversationIds.includes(conversation.id)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    conversationIds: event.target.checked
                      ? [...draft.conversationIds, conversation.id]
                      : draft.conversationIds.filter(
                          (id) => id !== conversation.id,
                        ),
                  })
                }
              />
              <span>
                <span>{conversation.title}</span>
                <small>{conversation.purpose}</small>
              </span>
            </label>
          ))}
        </div>
        {fieldErrors.conversationIds && (
          <p className={styles.error}>{fieldErrors.conversationIds}</p>
        )}
      </section>
    </div>
  );
}
