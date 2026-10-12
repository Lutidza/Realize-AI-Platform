/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationPreview.tsx
 * @version 1.3.1
 * @date 2026-10-12
 * @description Выбирает предметный предпросмотр текста, структуры страницы или назначения категории.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

"use client";

import type { CategoryAssignmentPreviewDTO } from "@realize/ai-contracts";
import { ChevronDown } from "lucide-react";

import styles from "./ChangeRequestCard.module.css";
import type { DataOperationPreviewProps } from "./DataOperationCard.types";
import { PageDraftPreview } from "./PageDraftPreview";
import { PageDraftUpdatePreview } from "./PageDraftUpdatePreview";
import { PageDraftStructurePreview } from "./PageDraftStructurePreview";
import { PagePublicationPreview } from "./PagePublicationPreview.component";

const categoryList = (
  categories: CategoryAssignmentPreviewDTO["beforeCategories"],
) =>
  categories.length ? (
    <ul>
      {categories.map((category) => (
        <li key={category.id}>
          {category.title}
          {category.slug ? <code> · {category.slug}</code> : null}
        </li>
      ))}
    </ul>
  ) : (
    <p>Без категорий</p>
  );

/** Отображает проверенное сервером содержание без универсальной формы изменения данных. */
export const DataOperationPreview = ({
  operation,
}: DataOperationPreviewProps) => {
  if (operation.kind === "pages.createDraft.v1") {
    return <PageDraftPreview operation={operation} />;
  }
  if (operation.kind === "pages.updateDraft.v1")
    return <PageDraftUpdatePreview operation={operation} />;
  if (operation.kind === "pages.updateStructureDraft.v1")
    return <PageDraftStructurePreview operation={operation} />;
  if (
    operation.kind === "pages.publishDraft.v1" ||
    operation.kind === "pages.restorePublication.v1"
  )
    return <PagePublicationPreview operation={operation} />;
  return (
    <details
      className={styles.details}
      open={operation.state === "awaiting_approval"}
    >
      <summary>
        <span>Проверить dry-run</span>
        <ChevronDown size={16} />
      </summary>
      <div className={styles.detailsBody}>
        <div>
          <h3>Товар</h3>
          <p>
            {operation.preview.product.title}
            {operation.preview.product.slug
              ? ` · ${operation.preview.product.slug}`
              : ""}
          </p>
        </div>
        <div>
          <h3>До</h3>
          {categoryList(operation.preview.beforeCategories)}
        </div>
        <div>
          <h3>После</h3>
          {categoryList(operation.preview.afterCategories)}
        </div>
        <dl className={styles.hashes}>
          <div>
            <dt>Operation</dt>
            <dd title={operation.operationHash}>
              {operation.operationHash.slice(0, 16)}…
            </dd>
          </div>
          <div>
            <dt>Rollback</dt>
            <dd title={operation.rollbackHash}>
              {operation.rollbackHash.slice(0, 16)}…
            </dd>
          </div>
        </dl>
      </div>
    </details>
  );
};
