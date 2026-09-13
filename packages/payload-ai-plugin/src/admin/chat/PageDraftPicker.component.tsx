/**
 * @file packages/payload-ai-plugin/src/admin/chat/PageDraftPicker.component.tsx
 * @version 1.0.0
 * @date 2026-09-12
 * @description Позволяет выбрать одну CMS-страницу и прочитать её текущую ревизию перед сообщением.
 */

"use client";
import { UiButton, UiInput, UiNotice } from "@realize/ui-kit";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { PageDraftPickerProps } from "./PageDraftPicker.types";
import { usePageDraftPicker } from "./usePageDraftPicker.hook";
import composerStyles from "./ChatComposer.module.css";
import styles from "./ChatAgentConfiguration.module.css";

export const PageDraftPicker = ({
  context,
  disabled,
}: PageDraftPickerProps) => {
  const picker = usePageDraftPicker();
  return (
    <div
      className={`${composerStyles.filePicker} ${styles.picker}`}
      data-popup-prevent-close
    >
      <strong>Страница для изменения черновика</strong>
      <p className={styles.empty}>
        Выберите одну страницу. Изменения её текста потребуют отдельного
        подтверждения.
      </p>
      <UiInput
        type="search"
        maxLength={128}
        aria-label="Поиск страниц CMS"
        placeholder="Название или адрес страницы"
        value={picker.query}
        onChange={(event) => picker.setQuery(event.target.value)}
      />
      <div className={styles.pagination}>
        <span>Страниц: {picker.totalDocs}</span>
        <div>
          <UiButton
            variant="ghost"
            size="icon"
            aria-label="Предыдущая страница результатов CMS"
            disabled={picker.page === 1 || picker.isLoading}
            onClick={() => picker.setPage(picker.page - 1)}
          >
            <ChevronLeft size={15} />
          </UiButton>
          <span>
            {picker.page} / {picker.totalPages}
          </span>
          <UiButton
            variant="ghost"
            size="icon"
            aria-label="Следующая страница результатов CMS"
            disabled={picker.page >= picker.totalPages || picker.isLoading}
            onClick={() => picker.setPage(picker.page + 1)}
          >
            <ChevronRight size={15} />
          </UiButton>
        </div>
      </div>
      {picker.error ? (
        <UiNotice tone="danger" role="alert">
          {picker.error}
        </UiNotice>
      ) : picker.isLoading ? (
        <p role="status">Загружаем страницы…</p>
      ) : picker.pages.length ? (
        <ul
          className={styles.rows}
          tabIndex={0}
          aria-label="Доступные страницы CMS"
        >
          {picker.pages.map((page) => (
            <li key={page.id}>
              <UiButton
                variant="ghost"
                aria-pressed={context.pageDraft?.id === page.id}
                aria-label={`Выбрать страницу «${page.title}»`}
                disabled={disabled || context.isSelectingPageDraft}
                onClick={() => void context.selectPageDraft(page.id)}
              >
                <span>
                  <strong>{page.title}</strong>
                  <small>
                    {page.slug ? `/${page.slug}` : `Страница ${page.id}`}
                  </small>
                </span>
                {context.pageDraft?.id === page.id && (
                  <Check size={16} aria-hidden="true" />
                )}
              </UiButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Страницы по запросу не найдены.</p>
      )}
      {context.isSelectingPageDraft && (
        <p role="status">Читаем текущую версию страницы…</p>
      )}
    </div>
  );
};
