/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopFiles.component.tsx
 * @version 1.1.0
 * @date 2026-09-26
 * @description Редактирует разрешённые текстовые файлы макета без исполнения в Admin.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useState } from "react";
import { FileCode2, Plus, Trash2 } from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
  UiTextarea,
} from "@realize/ui-kit";
import {
  DESIGN_WORKSHOP_LIMITS,
  designSnapshotSchema,
} from "@realize/ai-contracts";
import type { WorkshopSnapshotProps } from "./DesignWorkshopClient.types";
import styles from "./Workshop.module.css";

export function WorkshopFiles({
  value,
  onChange,
  disabled,
}: WorkshopSnapshotProps) {
  const [selectedPath, setSelectedPath] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const selected =
    value.files.find((file) => file.path === selectedPath) ?? value.files[0];
  const add = () => {
    const next = {
      ...value,
      files: [...value.files, { path: path.trim(), content: "" }],
    };
    const parsed = designSnapshotSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    onChange(next);
    setSelectedPath(path.trim());
    setPath("");
    setError("");
  };
  return (
    <section className={styles.section} aria-label="Файлы проекта">
      <div className={styles.sectionHeading}>
        <div>
          <h2>Файлы макета</h2>
          <p>Редактируйте исходники и сохраняйте их вместе с версией.</p>
        </div>
        <UiBadge>
          {value.files.length} / {DESIGN_WORKSHOP_LIMITS.files}
        </UiBadge>
      </div>
      <form
        className={styles.addFile}
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label className={styles.field}>
          <span>Путь нового файла</span>
          <UiInput
            value={path}
            disabled={disabled}
            maxLength={256}
            placeholder="src/components/TaskView.tsx"
            onChange={(event) => setPath(event.target.value)}
          />
        </label>
        <UiButton
          variant="secondary"
          type="submit"
          disabled={
            disabled ||
            !path.trim() ||
            value.files.length >= DESIGN_WORKSHOP_LIMITS.files
          }
        >
          <Plus size={16} />
          Добавить
        </UiButton>
      </form>
      {error && (
        <UiNotice tone="danger" role="alert">
          {error}
        </UiNotice>
      )}
      {selected ? (
        <>
          <div className={styles.fileToolbar}>
            <FileCode2 size={18} aria-hidden="true" />
            <UiSelect
              aria-label="Выбранный файл"
              value={selected.path}
              disabled={disabled}
              onChange={(event) => setSelectedPath(event.target.value)}
            >
              {value.files.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.path}
                </option>
              ))}
            </UiSelect>
            <UiButton
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={"Удалить файл " + selected.path}
              onClick={() =>
                onChange({
                  ...value,
                  files: value.files.filter(
                    (file) => file.path !== selected.path,
                  ),
                })
              }
            >
              <Trash2 size={16} />
            </UiButton>
          </div>
          <UiTextarea
            className={styles.codeEditor}
            aria-label={"Содержимое " + selected.path}
            value={selected.content}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            rows={20}
            maxLength={DESIGN_WORKSHOP_LIMITS.fileBytes}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                files: value.files.map((file) =>
                  file.path === selected.path
                    ? { ...file, content: event.target.value }
                    : file,
                ),
              })
            }
          />
        </>
      ) : (
        <div className={styles.inlineEmpty}>
          <FileCode2 size={24} aria-hidden="true" />
          <p>Файлов пока нет. Начните с компонента, страницы или стилей.</p>
        </div>
      )}
      <p className={styles.caption}>
        Файлы хранятся в проекте. Сохраните версию и откройте вкладку
        «Предпросмотр», чтобы проверить React-макет.
      </p>
    </section>
  );
}
