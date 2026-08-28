/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationPreview.tsx
 * @version 2026-08-28
 * @description Показывает resolved before/after snapshot и hashes DataOperation.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

"use client";

import type { DataOperationDTO } from "@realize/ai-contracts";
import { ChevronDown } from "lucide-react";

import styles from "./ChangeRequestCard.module.css";

const categoryList = (
  categories: DataOperationDTO["preview"]["beforeCategories"],
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

/** Renders the server-resolved dry-run without accepting generic mutation input. */
export const DataOperationPreview = ({
  operation,
}: {
  operation: DataOperationDTO;
}) => (
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
