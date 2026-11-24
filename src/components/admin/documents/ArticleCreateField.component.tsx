/**
 * @file src/components/admin/documents/ArticleCreateField.component.tsx
 * @version 1.0.1
 * @date 2026-11-24
 * @description Связывает поля статьи с подписями, адресами и ошибками.
 * @see documentation/specifications/realize-ai-control-panel/documents/creation.md
 */
import { UiInput, UiTextarea } from "@realize/ui-kit";
import type { ArticleFieldProps } from "./ArticleCreateForm.types";
import styles from "./ArticleCreateForm.module.css";

/** Путь совпадает с ключом поля в ответе сервера, включая массивы разделов и абзацев. */
export function ArticleCreateField({
  path,
  label,
  value,
  error,
  hint,
  required,
  rows,
  maxLength,
  identifier,
  onChange,
}: ArticleFieldProps) {
  const id = `article-create-${path}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const properties = {
    id,
    name: path,
    value,
    required,
    maxLength,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {rows ? (
        <UiTextarea
          {...properties}
          rows={rows}
          className={styles.textarea}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : (
        <UiInput
          {...properties}
          autoCapitalize={identifier ? "none" : undefined}
          spellCheck={identifier ? false : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
