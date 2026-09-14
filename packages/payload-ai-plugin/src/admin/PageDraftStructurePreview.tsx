/**
 * @file packages/payload-ai-plugin/src/admin/PageDraftStructurePreview.tsx
 * @version 1.0.1
 * @date 2026-09-14
 * @description Показывает точное размещение и полное вставляемое или удаляемое содержимое Content перед подтверждением.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
"use client";

import { ChevronDown } from "lucide-react";
import styles from "./ChangeRequestCard.module.css";
import type { PageDraftStructurePreviewProps } from "./PageDraftStructurePreview.types";

/** Индексы переводятся в видимые позиции; текст не обрезается и не интерпретируется как HTML. */
export const PageDraftStructurePreview = ({
  operation,
}: PageDraftStructurePreviewProps) => {
  const preview = operation.preview;
  const title =
    preview.action === "insert"
      ? "Добавление текстового блока"
      : preview.action === "move"
        ? "Перемещение текстового блока"
        : "Удаление текстового блока";
  return (
    <details
      className={styles.details}
      open={operation.state === "awaiting_approval"}
      data-testid="page-structure-preview"
    >
      <summary>
        <span>Проверить структуру страницы</span>
        <ChevronDown size={16} />
      </summary>
      <div className={styles.detailsBody}>
        <div>
          <h3>Страница</h3>
          <p>
            {preview.page.title}
            {preview.page.slug ? ` · /${preview.page.slug}` : ""}
          </p>
        </div>
        <section aria-label={title}>
          <h3>{title}</h3>
          <dl className={styles.textDiff}>
            <div>
              <dt>До изменения</dt>
              <dd>
                {preview.beforeIndex === null
                  ? "Блока ещё нет"
                  : `Позиция ${preview.beforeIndex + 1} из ${preview.totalBefore}`}
              </dd>
            </div>
            <div>
              <dt>После изменения</dt>
              <dd>
                {preview.afterIndex === null
                  ? "Блок будет удалён"
                  : `Позиция ${preview.afterIndex + 1} из ${preview.totalAfter}`}
              </dd>
            </div>
          </dl>
        </section>
        <p>
          Количество блоков: {preview.totalBefore} → {preview.totalAfter}.
        </p>
        {preview.action !== "remove" ? (
          <p>
            {preview.beforeBlockID === null ? (
              "Размещение: в конце страницы."
            ) : (
              <>
                Размещение: перед блоком <code>{preview.beforeBlockID}</code>.
              </>
            )}
          </p>
        ) : null}
        <p>
          Блок Content · <code>{preview.blockID}</code>
        </p>
        {preview.content ? (
          <section
            aria-label={
              preview.action === "remove"
                ? "Содержимое удаляемого блока"
                : "Содержимое нового блока"
            }
          >
            <h3>
              {preview.action === "remove"
                ? "Будет удалено целиком"
                : "Добавляемое содержимое"}
            </h3>
            {preview.content.blockName ? (
              <p>{preview.content.blockName}</p>
            ) : null}
            <dl className={styles.textDiff}>
              {preview.content.columns.map((column, index) => (
                <div key={index}>
                  <dt>
                    Колонка {index + 1} ·{" "}
                    {column.size === "full"
                      ? "полная ширина"
                      : column.size === "half"
                        ? "½ ширины"
                        : column.size === "twoThirds"
                          ? "⅔ ширины"
                          : "⅓ ширины"}
                  </dt>
                  <dd>{column.text || <em>Пустая колонка</em>}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <p>Изменение сохранится в черновик. Публикация выполняется отдельно.</p>
      </div>
    </details>
  );
};
