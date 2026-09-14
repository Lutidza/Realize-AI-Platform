/**
 * @file packages/payload-ai-plugin/src/admin/PagePublicationPreview.component.tsx
 * @version 1.2.0
 * @date 2026-09-14
 * @description Показывает выбранную публичную версию и границы проверок публикации либо восстановления.
 */
"use client";
import { ChevronDown } from "lucide-react";
import type { PagePublicationOperationProps } from "./PagePublication.types";
import styles from "./ChangeRequestCard.module.css";

export const PagePublicationPreview = ({
  operation,
}: PagePublicationOperationProps) => (
  <details
    className={styles.details}
    open={operation.state === "awaiting_approval"}
  >
    <summary>
      <span>Проверить публичную версию</span>
      <ChevronDown size={16} />
    </summary>
    <div className={styles.detailsBody}>
      <h3>{operation.preview.page.title}</h3>
      <dl className={styles.textDiff}>
        <div>
          <dt>
            {operation.state === "applied"
              ? "До применения"
              : "Сейчас на сайте"}
          </dt>
          <dd>
            {operation.preview.before.status === "published"
              ? `Опубликована: ${operation.preview.before.page.title}`
              : "Страница не опубликована"}
          </dd>
        </div>
        <div>
          <dt>После применения</dt>
          <dd>
            {operation.preview.after.status === "published"
              ? `${operation.state === "applied" ? "Опубликована" : "Будет опубликована"}: ${operation.preview.after.page.title}`
              : operation.state === "applied"
                ? "Публикация снята"
                : "Публикация будет снята"}
          </dd>
        </div>
      </dl>
      {operation.kind === "pages.restorePublication.v1" ? (
        <p>
          {operation.state === "applied"
            ? "Прежнее состояние публикации восстановлено. Более новый рабочий черновик сохранён."
            : "Восстановится прежняя публичная версия. Более новый рабочий черновик сохранится."}
        </p>
      ) : (
        <p>
          {operation.state === "applied"
            ? "Опубликована сохранённая версия, выбранная при подготовке плана."
            : "Будет опубликована сохранённая версия, выбранная при подготовке этого плана."}
        </p>
      )}
      <p>
        {operation.kind === "pages.publishDraft.v1" &&
        operation.state === "awaiting_approval"
          ? "После подготовки этого плана откройте страницу на фронте и проверьте её на ширине компьютера и телефона. Предпросмотр также доступен в админке по кнопке с глазом. Если вы сохраните изменения, понадобится новый план публикации."
          : "Редактор показывает текущий черновик страницы."}
      </p>
      <ul>
        {operation.preview.checks.map((check, index) => (
          <li key={`${check.id}:${index}`}>
            <strong>
              {check.status === "passed"
                ? "Пройдено"
                : check.status === "failed"
                  ? "Не пройдено"
                  : "Не проверено"}
              .
            </strong>{" "}
            {check.message}
            {check.target ? <p>{check.target}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  </details>
);
