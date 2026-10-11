/**
 * @file src/components/admin/task-manager/TaskGitBindingsEditor.component.tsx
 * @version 1.0.0
 * @date 2026-10-11
 * @description Редактирует ручные привязки задач к репозиторию и SHA коммита.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  UiBadge,
  UiButton,
  UiInput,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import type { TaskGitBindingsEditorProps } from "./TaskManager.types";
import styles from "./TaskManagerWorkbench.module.css";

/** Привязка сохраняет контекст изменения и остаётся непроверенной после записи. */
export function TaskGitBindingsEditor({
  value,
  onChange,
}: TaskGitBindingsEditorProps) {
  return (
    <section className={styles.stack} aria-label="Привязки Git">
      <div className={styles.sectionHeading}>
        <h3>Репозитории и коммиты</h3>
        <UiBadge>Вручную · Не проверено</UiBadge>
      </div>
      <p className={styles.muted}>
        Укажите репозиторий и полный SHA. Эта запись не подтверждает merge или
        выпуск версии.
      </p>
      {value.map((binding, index) => (
        <UiSurface key={index} tone="raised" className={styles.binding}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Репозиторий {index + 1}
              <UiInput
                value={binding.repositoryId}
                placeholder="organization/repository"
                maxLength={200}
                onChange={(event) =>
                  onChange(
                    value.map((item, offset) =>
                      offset === index
                        ? { ...item, repositoryId: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <label className={styles.field}>
              Назначение {index + 1}
              <UiSelect
                value={binding.purpose}
                onChange={(event) =>
                  onChange(
                    value.map((item, offset) =>
                      offset === index
                        ? {
                            ...item,
                            purpose: event.target
                              .value as typeof binding.purpose,
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="platform-core">Код платформы</option>
                <option value="customer-project">Код проекта</option>
              </UiSelect>
            </label>
            <label className={`${styles.field} ${styles.fullWidth}`}>
              SHA коммита {index + 1}
              <UiInput
                value={binding.commitSha}
                placeholder="Полный SHA: 40 или 64 символа"
                maxLength={64}
                onChange={(event) =>
                  onChange(
                    value.map((item, offset) =>
                      offset === index
                        ? { ...item, commitSha: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
          </div>
          <UiButton
            type="button"
            size="small"
            variant="ghost"
            onClick={() =>
              onChange(value.filter((_, offset) => offset !== index))
            }
          >
            Удалить привязку {index + 1}
          </UiButton>
        </UiSurface>
      ))}
      <div>
        <UiButton
          type="button"
          variant="secondary"
          size="small"
          disabled={value.length >= 50}
          onClick={() =>
            onChange([
              ...value,
              {
                repositoryId: "",
                commitSha: "",
                purpose: "platform-core",
                source: "manual",
                verification: "unverified",
              },
            ])
          }
        >
          Добавить коммит
        </UiButton>
      </div>
    </section>
  );
}
