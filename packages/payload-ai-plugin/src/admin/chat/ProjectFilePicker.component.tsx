/**
 * @file packages/payload-ai-plugin/src/admin/chat/ProjectFilePicker.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Показывает поиск реальных файлов проекта и выбранные ссылки.
 */

"use client";
import { CHAT_PROJECT_FILE_LIMIT } from "@realize/ai-contracts";
import { UiButton, UiInput, UiNotice } from "@realize/ui-kit";
import { Check, FileCode2 } from "lucide-react";
import { useProjectFilePicker } from "./useProjectFilePicker.hook";
import type { ProjectFilePickerProps } from "./ProjectFilePicker.types";
import styles from "./ChatComposer.module.css";
export const ProjectFilePicker = ({
  context,
  disabled,
}: ProjectFilePickerProps) => {
  const picker = useProjectFilePicker();
  const limit =
    context.capabilities?.projectFiles.maxFiles ?? CHAT_PROJECT_FILE_LIMIT;
  return (
    <div className={styles.filePicker} data-popup-prevent-close>
      <strong>Файлы проекта</strong>
      <UiInput
        aria-label="Поиск файлов проекта"
        placeholder="Поиск по имени или пути…"
        type="search"
        value={picker.query}
        onChange={(event) => picker.setQuery(event.target.value)}
      />
      <div className={styles.fileResults} aria-busy={picker.isLoading}>
        {picker.error ? (
          <UiNotice tone="danger">{picker.error}</UiNotice>
        ) : picker.isLoading ? (
          <p role="status">Ищем файлы…</p>
        ) : picker.files.length ? (
          picker.files.map((file) => {
            const selected = context.projectFiles.some(
              (item) => item.path === file.path,
            );
            return (
              <UiButton
                key={file.path}
                aria-pressed={selected}
                disabled={
                  disabled ||
                  (!selected && context.projectFiles.length >= limit)
                }
                onClick={() =>
                  context.setProjectFiles(
                    selected
                      ? context.projectFiles.filter(
                          (item) => item.path !== file.path,
                        )
                      : [...context.projectFiles, file],
                  )
                }
                variant="ghost"
                size="small"
              >
                <FileCode2 size={16} />
                <span>{file.path}</span>
                {selected ? <Check size={15} /> : null}
              </UiButton>
            );
          })
        ) : (
          <p>Файлы не найдены</p>
        )}
      </div>
      <p className={styles.support}>
        {context.projectFiles.length} из {limit} выбрано
        {picker.truncated
          ? " · Уточните поиск, чтобы увидеть остальные файлы"
          : ""}
      </p>
    </div>
  );
};
