/**
 * @file packages/payload-ai-plugin/src/admin/PageDraftUpdatePreview.tsx
 * @version 1.0.0
 * @date 2026-09-12
 * @description Показывает полный текст до и после каждого изменения черновика для подтверждения.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

"use client";
import type { PageDraftUpdatePreviewProps } from "./PageDraftUpdatePreview.types";
import { ChevronDown } from "lucide-react";
import styles from "./ChangeRequestCard.module.css";

/** Обычный текст сохраняет пробелы и переносы; HTML и служебные пути не исполняются. */
export const PageDraftUpdatePreview = ({
  operation,
}: PageDraftUpdatePreviewProps) => (
  <details
    className={styles.details}
    open={operation.state === "awaiting_approval"}
  >
    <summary>
      <span>Проверить изменения страницы</span>
      <ChevronDown size={16} />
    </summary>
    <div className={styles.detailsBody}>
      <div>
        <h3>Страница</h3>
        <p>
          {operation.preview.page.title}
          {operation.preview.page.slug
            ? ` · /${operation.preview.page.slug}`
            : ""}
        </p>
      </div>
      <p>
        Изменения сохранятся в черновик. Опубликованная версия не изменится.
      </p>
      {operation.preview.changes.map((change, index) => (
        <section
          key={change.path}
          aria-label={`Изменение ${index + 1}: ${change.label}`}
        >
          <h3>{change.label}</h3>
          <dl className={styles.textDiff}>
            <div>
              <dt>До изменения</dt>
              <dd>{change.before || <em>Пустое значение</em>}</dd>
            </div>
            <div>
              <dt>После изменения</dt>
              <dd>{change.after || <em>Пустое значение</em>}</dd>
            </div>
          </dl>
        </section>
      ))}
    </div>
  </details>
);
