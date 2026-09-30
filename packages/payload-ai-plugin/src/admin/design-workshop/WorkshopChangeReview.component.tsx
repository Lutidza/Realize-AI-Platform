/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopChangeReview.component.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Показывает точный подготовленный кандидат перед созданием новой версии.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { UiBadge, UiButton, UiDialog, UiNotice } from "@realize/ui-kit";
import type { WorkshopReviewProps } from "./DesignWorkshopClient.types";
import {
  workshopBriefText,
  workshopSourcesText,
} from "./workshopSnapshotPresentation.util";
import styles from "./Workshop.module.css";

/** Показывает именно серверный candidate; фоновое редактирование закрыто модальным диалогом. */
export function WorkshopChangeReview({
  before,
  candidate,
  theme,
  busy,
  error,
  onClose,
  onApply,
}: WorkshopReviewProps) {
  const pair = (oldValue: string, newValue: string) => (
    <div className={styles.comparison}>
      <div>
        <h4>Было</h4>
        <pre>{oldValue || "Пусто"}</pre>
      </div>
      <div>
        <h4>Будет</h4>
        <pre>{newValue || "Пусто"}</pre>
      </div>
    </div>
  );
  return (
    <UiDialog
      open
      mode={theme}
      size="wide"
      title="Проверка изменений"
      description={
        "Версия " +
        candidate.baseRevision.number +
        " → новая версия. После применения изменения сохранятся в истории."
      }
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      footer={
        <div className={styles.actions}>
          <UiButton variant="secondary" disabled={busy} onClick={onClose}>
            Вернуться к редактированию
          </UiButton>
          <UiButton
            disabled={busy || candidate.status !== "prepared"}
            onClick={onApply}
          >
            {busy ? "Сохранение…" : "Применить изменения"}
          </UiButton>
        </div>
      }
    >
      <div className={styles.form}>
        <strong>{candidate.summary}</strong>
        {error && (
          <UiNotice role="alert" tone="danger">
            {error}
          </UiNotice>
        )}
        {candidate.status !== "prepared" && (
          <UiNotice>
            Этот кандидат уже применён или истёк. Вернитесь к редактированию и
            обновите проект.
          </UiNotice>
        )}
        {candidate.diff.briefChanged && (
          <details className={styles.details} open>
            <summary>Бриф</summary>
            {pair(
              workshopBriefText(before.brief),
              workshopBriefText(candidate.candidate.brief),
            )}
          </details>
        )}
        {candidate.diff.sourcesChanged && (
          <details className={styles.details} open>
            <summary>Материалы</summary>
            {pair(
              workshopSourcesText(before.sources),
              workshopSourcesText(candidate.candidate.sources),
            )}
          </details>
        )}
        {candidate.diff.files.map((file) => (
          <details className={styles.details} key={file.path}>
            <summary>
              <span className={styles.breakWord}>{file.path}</span>{" "}
              <UiBadge tone={file.kind === "deleted" ? "danger" : "positive"}>
                {
                  { added: "Добавлен", modified: "Изменён", deleted: "Удалён" }[
                    file.kind
                  ]
                }
              </UiBadge>
            </summary>
            {pair(
              before.files.find((item) => item.path === file.path)?.content ??
                "Файла нет",
              candidate.candidate.files.find((item) => item.path === file.path)
                ?.content ?? "Файл будет удалён",
            )}
          </details>
        ))}
      </div>
    </UiDialog>
  );
}
