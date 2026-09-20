/**
 * @file src/components/admin/task-manager/reference/TaskGitLinksEditor.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Заполняет ручные ссылки на Git и доставку без запуска внешних операций.
 * @see documentation/specifications/task-management.md
 */

import { UiBadge, UiButton, UiInput, UiSelect } from "@realize/ui-kit";
import { GitBranch, Plus, Trash2 } from "lucide-react";
import type { TaskGitLinksEditorProps } from "./TaskComposer.types";
import type { GitLink } from "./taskManager.types";
import { gitKindLabels, gitStatusLabels } from "./taskComposer.constants";
import styles from "./TaskDraftEditor.module.css";

/** При редактировании примера он становится ручной непроверенной ссылкой. */
export function TaskGitLinksEditor({
  value,
  fieldErrors,
  onChange,
}: TaskGitLinksEditorProps) {
  const update = (id: string, patch: Partial<GitLink>) =>
    onChange(
      value.map((link) =>
        link.id === id
          ? { ...link, ...patch, source: "manual", status: "unverified" }
          : link,
      ),
    );
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <h3>Git и доставка</h3>
          <p>
            Ветка, коммит, push, pull request, сборка и релиз — в контексте
            задачи.
          </p>
        </div>
        <GitBranch size={20} />
      </div>
      <p className={styles.callout}>
        Ручная ссылка не подтверждает выполнение операции. В прототипе команды
        Git и публикация не запускаются.
      </p>
      {!value.length && (
        <p className={styles.empty}>
          Добавьте ссылку на результат работы или связанное изменение.
        </p>
      )}
      {value.map((link, index) => (
        <article className={styles.checklist} key={link.id}>
          <header className={styles.sectionHeading}>
            <strong>Связь {index + 1}</strong>
            <div className={styles.rowActions}>
              <UiBadge>
                {link.source === "demo" ? "Пример · " : "Вручную · "}
                {gitStatusLabels[link.status]}
              </UiBadge>
              <UiButton
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Удалить Git-связь ${index + 1}`}
                onClick={() =>
                  onChange(value.filter((item) => item.id !== link.id))
                }
              >
                <Trash2 size={15} />
              </UiButton>
            </div>
          </header>
          <div className={styles.twoColumns}>
            <label className={styles.field}>
              <span>Тип связи</span>
              <UiSelect
                aria-label={`Тип Git-связи ${index + 1}`}
                value={link.kind}
                onChange={(event) =>
                  update(link.id, {
                    kind: event.target.value as GitLink["kind"],
                  })
                }
              >
                {Object.entries(gitKindLabels).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </UiSelect>
            </label>
            <label className={styles.field}>
              <span>Название</span>
              <UiInput
                aria-label={`Название Git-связи ${index + 1}`}
                value={link.label}
                placeholder="Например, исправление создания задачи"
                aria-invalid={Boolean(fieldErrors[`gitLinks.${index}.label`])}
                onChange={(event) =>
                  update(link.id, { label: event.target.value })
                }
              />
              {fieldErrors[`gitLinks.${index}.label`] && (
                <small className={styles.error}>
                  {fieldErrors[`gitLinks.${index}.label`]}
                </small>
              )}
            </label>
            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>URL</span>
              <UiInput
                aria-label={`URL Git-связи ${index + 1}`}
                value={link.url}
                placeholder="https://github.com/organization/repository/commit/…"
                aria-invalid={Boolean(fieldErrors[`gitLinks.${index}.url`])}
                onChange={(event) =>
                  update(link.id, { url: event.target.value })
                }
              />
              {fieldErrors[`gitLinks.${index}.url`] && (
                <small className={styles.error}>
                  {fieldErrors[`gitLinks.${index}.url`]}
                </small>
              )}
            </label>
            <label className={styles.field}>
              <span>Репозиторий</span>
              <UiInput
                aria-label={`Репозиторий Git-связи ${index + 1}`}
                value={link.repository}
                placeholder="organization/repository"
                onChange={(event) =>
                  update(link.id, { repository: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span>Ветка / SHA / ref</span>
              <UiInput
                aria-label={`Ревизия Git-связи ${index + 1}`}
                value={link.revision}
                placeholder="feature/task-manager"
                onChange={(event) =>
                  update(link.id, { revision: event.target.value })
                }
              />
            </label>
          </div>
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
                kind: "commit",
                label: "",
                url: "",
                repository: "",
                revision: "",
                source: "manual",
                status: "unverified",
              },
            ])
          }
        >
          <Plus size={15} /> Добавить Git-связь
        </UiButton>
      </div>
    </section>
  );
}
