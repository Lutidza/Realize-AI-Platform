/**
 * @file src/components/admin/media/MediaLibraryGrid.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Показывает настоящие Media в сетке рабочего списка Payload.
 * @see documentation/specifications/media-management.md
 */
"use client";

import {
  CheckboxInput,
  Thumbnail,
  useAuth,
  useConfig,
  useListQuery,
  useSelection,
  useTheme,
} from "@payloadcms/ui";
import { UiNotice, UiSurface, UiTheme } from "@realize/ui-kit";
import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { formatAdminURL, formatFilesize } from "payload/shared";
import { useId } from "react";

import type { MediaLibraryGridProps } from "./MediaLibrary.types";
import { mapMediaLibraryItem } from "./mapMediaLibraryItem.mapper";
import styles from "./MediaLibraryGrid.module.css";

/** Монтируется только внутри родных ListQueryProvider и SelectionProvider. */
export const MediaLibraryGrid = ({
  enableRowSelections = false,
}: MediaLibraryGridProps) => {
  const { data } = useListQuery();
  const { config } = useConfig();
  const { user } = useAuth();
  const { selected, setSelection, selectAll, toggleAll } = useSelection();
  const { theme } = useTheme();
  const gridID = useId();
  const selectAllID = `${gridID}-select-all`;
  const selectAllLabelID = `${selectAllID}-label`;
  const items = (data?.docs ?? []).flatMap((document: unknown) => {
    const item = mapMediaLibraryItem(document);
    return item ? [item] : [];
  });

  return (
    <UiTheme mode={theme} className={styles.root}>
      {items.length < (data?.docs.length ?? 0) && (
        <UiNotice tone="danger" role="status">
          Часть записей не удалось отобразить. Обновите страницу.
        </UiNotice>
      )}
      {enableRowSelections && items.length > 0 && (
        <div className={styles.selectionBar}>
          <CheckboxInput
            id={selectAllID}
            name={selectAllLabelID}
            Label={
              <label id={selectAllLabelID} htmlFor={selectAllID}>
                Выбрать файлы на странице
              </label>
            }
            checked={selectAll === "allInPage" || selectAll === "allAvailable"}
            partialChecked={selectAll === "some"}
            onToggle={() => toggleAll()}
          />
        </div>
      )}
      <div className={styles.grid}>
        {items.map((item) => {
          const lockedByAnother =
            item.isLocked &&
            (item.editingUserID === null || item.editingUserID !== user?.id);
          const checkboxID = `${gridID}-${typeof item.id}-${encodeURIComponent(String(item.id))}`;
          const labelID = `${checkboxID}-label`;
          const editorURL = formatAdminURL({
            adminRoute: config.routes.admin,
            path: `/collections/media/${encodeURIComponent(String(item.id))}`,
          });
          return (
            <UiSurface
              key={`${typeof item.id}:${item.id}`}
              asChild
              className={styles.card}
              data-selected={selected.get(item.id) || undefined}
            >
              <article>
                {(enableRowSelections || lockedByAnother) && (
                  <div className={styles.cardActions}>
                    {enableRowSelections && (
                      <CheckboxInput
                        id={checkboxID}
                        name={labelID}
                        Label={
                          <label
                            id={labelID}
                            htmlFor={checkboxID}
                            className={styles.visuallyHidden}
                          >
                            Выбрать файл {item.filename}
                          </label>
                        }
                        checked={Boolean(selected.get(item.id))}
                        readOnly={lockedByAnother}
                        onToggle={() => {
                          if (!lockedByAnother) setSelection(item.id);
                        }}
                      />
                    )}
                    {lockedByAnother && (
                      <span className={styles.lock}>
                        <LockKeyhole aria-hidden size={14} />
                        Редактируется другим пользователем
                      </span>
                    )}
                  </div>
                )}
                <Link
                  href={editorURL}
                  className={styles.link}
                  aria-label={`Открыть файл ${item.filename}`}
                >
                  <div className={styles.preview}>
                    <Thumbnail
                      size="expand"
                      doc={{ filename: item.filename }}
                      fileSrc={item.previewURL ?? undefined}
                      imageCacheTag={item.updatedAt ?? undefined}
                    />
                  </div>
                  <strong className={styles.filename}>{item.filename}</strong>
                  <p className={styles.alt}>
                    {item.alt || "Альтернативный текст не указан"}
                  </p>
                </Link>
                <dl className={styles.metadata}>
                  <div>
                    <dt>Тип</dt>
                    <dd>{item.mimeType ?? "Не указан"}</dd>
                  </div>
                  <div>
                    <dt>Размер файла</dt>
                    <dd
                      title={
                        item.filesize === null
                          ? undefined
                          : `${item.filesize.toLocaleString("ru-RU")} байт`
                      }
                    >
                      {item.filesize === null
                        ? "Не указан"
                        : formatFilesize(item.filesize)}
                    </dd>
                  </div>
                  {item.width !== null && item.height !== null && (
                    <div>
                      <dt>Изображение</dt>
                      <dd>
                        {item.width} × {item.height} px
                      </dd>
                    </div>
                  )}
                </dl>
              </article>
            </UiSurface>
          );
        })}
      </div>
    </UiTheme>
  );
};
