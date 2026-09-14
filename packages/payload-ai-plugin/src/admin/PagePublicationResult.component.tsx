/**
 * @file packages/payload-ai-plugin/src/admin/PagePublicationResult.component.tsx
 * @version 1.1.0
 * @date 2026-09-14
 * @description Разделяет сохранённую публикацию, обновление витрины и подготовку её восстановления.
 */
"use client";
import type { PagePublicationResultProps } from "./PagePublication.types";
import styles from "./ChangeRequestCard.module.css";

export const PagePublicationResult = ({
  operation,
  pending,
  onPrepareRestore,
  onRetryDelivery,
}: PagePublicationResultProps) => {
  const result = operation.result;
  if (!result) return null;
  return (
    <>
      <div className={styles.executeAction}>
        <div>
          <strong>
            {operation.preview.after.status === "published"
              ? "Публикация сохранена"
              : "Публикация снята"}
          </strong>
          <span>
            {result.delivery.status === "succeeded"
              ? "Витрина обновлена."
              : result.delivery.status === "failed"
                ? "Не удалось обновить витрину. Сохранённая публикация не изменена."
                : "Обновление витрины ожидает завершения."}
          </span>
        </div>
        {result.delivery.status !== "succeeded" && onRetryDelivery ? (
          <button type="button" disabled={pending} onClick={onRetryDelivery}>
            {pending ? "Обновляем…" : "Повторить обновление витрины"}
          </button>
        ) : null}
      </div>
      {operation.kind === "pages.publishDraft.v1" && onPrepareRestore ? (
        <div className={styles.executeAction}>
          <div>
            <strong>
              {operation.preview.before.status === "published"
                ? "Восстановить прежнюю публикацию"
                : "Снять первую публикацию"}
            </strong>
            <span>
              Подготовим отдельную операцию для подтверждения. Более новый
              черновик сохранится.
            </span>
          </div>
          <button type="button" disabled={pending} onClick={onPrepareRestore}>
            Подготовить восстановление публикации
          </button>
        </div>
      ) : null}
    </>
  );
};
