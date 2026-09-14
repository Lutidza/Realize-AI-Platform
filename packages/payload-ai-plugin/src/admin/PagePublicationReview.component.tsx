/**
 * @file packages/payload-ai-plugin/src/admin/PagePublicationReview.component.tsx
 * @version 1.1.0
 * @date 2026-09-14
 * @description Собирает явное свидетельство пользователя о просмотре выбранной версии без автоматического PASS.
 */
"use client";
import type { PagePublicationReviewProps } from "./PagePublication.types";
import styles from "./ChangeRequestCard.module.css";

export const PagePublicationReview = ({
  checks,
  disabled,
  onChange,
}: PagePublicationReviewProps) => (
  <div
    className={styles.detailsBody}
    role="group"
    aria-label="Подтверждение просмотра выбранной версии"
  >
    <h3>После подготовки плана я проверил страницу в предпросмотре</h3>
    <p>
      Это ваше подтверждение просмотра, а не результат автоматической проверки
      браузера.
    </p>
    <p>
      <label>
        <input
          type="checkbox"
          checked={checks.desktop}
          disabled={disabled}
          onChange={(event) => onChange("desktop", event.target.checked)}
        />{" "}
        На компьютере
      </label>
    </p>
    <p>
      <label>
        <input
          type="checkbox"
          checked={checks.mobile}
          disabled={disabled}
          onChange={(event) => onChange("mobile", event.target.checked)}
        />{" "}
        На телефоне
      </label>
    </p>
    <p>
      <label>
        <input
          type="checkbox"
          checked={checks.noErrors}
          disabled={disabled}
          onChange={(event) => onChange("noErrors", event.target.checked)}
        />{" "}
        Ошибок отображения не обнаружено
      </label>
    </p>
  </div>
);
