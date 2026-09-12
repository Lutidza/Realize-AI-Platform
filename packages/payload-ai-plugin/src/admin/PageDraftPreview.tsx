/**
 * @file packages/payload-ai-plugin/src/admin/PageDraftPreview.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Показывает адрес и полное содержание черновика страницы перед подтверждением.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

"use client";

import { ChevronDown } from "lucide-react";

import styles from "./ChangeRequestCard.module.css";
import type { PageDraftPreviewProps } from "./DataOperationCard.types";

/** Отображает подтверждаемый текст безопасно, без интерпретации HTML и публикации страницы. */
export const PageDraftPreview = ({ operation }: PageDraftPreviewProps) => (
  <details
    className={styles.details}
    open={operation.state === "awaiting_approval"}
  >
    <summary>
      <span>Проверить содержание страницы</span>
      <ChevronDown size={16} />
    </summary>
    <div className={styles.detailsBody}>
      <div>
        <h3>Название</h3>
        <p>{operation.preview.title}</p>
      </div>
      <div>
        <h3>Адрес страницы</h3>
        <p>/{operation.preview.slug}</p>
      </div>
      <div>
        <h3>Статус после создания</h3>
        <p>Черновик · не опубликован</p>
      </div>
      {operation.preview.description ? (
        <div>
          <h3>Описание</h3>
          <p>{operation.preview.description}</p>
        </div>
      ) : null}
      {operation.preview.sections.map((section, index) => (
        <div key={index}>
          <h3>{section.heading || `Раздел ${index + 1}`}</h3>
          <p>{section.body}</p>
        </div>
      ))}
    </div>
  </details>
);
