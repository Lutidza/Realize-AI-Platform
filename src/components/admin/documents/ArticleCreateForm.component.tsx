/**
 * @file src/components/admin/documents/ArticleCreateForm.component.tsx
 * @version 1.1.1
 * @date 2026-11-24
 * @description Показывает форму создания статьи в обоих макетах Control Panel.
 * @see documentation/specifications/realize-ai-control-panel/documents/creation.md
 */
"use client";

import { UiButton, UiConfirmation, UiNotice, UiSurface } from "@realize/ui-kit";
import { ControlPanelPreview } from "../control-panel-preview/ControlPanelPreview.component";
import { ArticleCreateField } from "./ArticleCreateField.component";
import { ArticleCreateSectionFields } from "./ArticleCreateSectionFields.component";
import { DocumentScreenContainer } from "./DocumentScreenContainer.component";
import type { ArticleCreateFormProps } from "./ArticleCreateForm.types";
import { documentRoute } from "./documentRoutes.util";
import { useArticleCreateForm } from "./useArticleCreateForm.hook";
import styles from "./ArticleCreateForm.module.css";

/** Черновик живёт над renderer, чтобы переключение макета не сбрасывало ввод. */
export function ArticleCreateForm({
  fromPage,
  ...initialAppearance
}: ArticleCreateFormProps) {
  const form = useArticleCreateForm(fromPage, initialAppearance);
  const { draft, fieldErrors, notice, operation, uncertain } = form;
  const sectionError = fieldErrors.sections;

  return (
    <ControlPanelPreview {...initialAppearance}>
      {({ mode }) => (
        <DocumentScreenContainer>
          <section
            aria-labelledby="article-create-heading"
            className={styles.stack}
          >
            <h1 id="article-create-heading" className={styles.title}>
              Создать статью
            </h1>
            <UiSurface className={styles.surface}>
              <form
                ref={form.formRef}
                className={styles.stack}
                aria-labelledby="article-create-heading"
                aria-busy={operation !== null}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void form.save();
                }}
              >
                {notice && (
                  <UiNotice
                    role={notice.tone === "danger" ? "alert" : "status"}
                    tone={notice.tone}
                    tabIndex={-1}
                    data-article-feedback
                  >
                    {fieldErrors.form ?? notice.message}
                  </UiNotice>
                )}
                {uncertain && (
                  <div className={styles.actions}>
                    <UiButton
                      type="button"
                      variant="secondary"
                      disabled={operation !== null}
                      onClick={() => void form.checkSave()}
                    >
                      {operation === "check"
                        ? "Проверяем…"
                        : "Проверить сохранение"}
                    </UiButton>
                  </div>
                )}
                <fieldset
                  className={styles.fields}
                  disabled={operation !== null || Boolean(uncertain)}
                >
                  <div className={styles.columns}>
                    <ArticleCreateField
                      path="title"
                      label="Заголовок статьи"
                      value={draft.title}
                      error={fieldErrors.title}
                      required
                      maxLength={160}
                      onChange={form.changeTitle}
                    />
                    <div className={styles.address}>
                      <ArticleCreateField
                        path="slug"
                        label="Адрес статьи"
                        value={draft.slug}
                        error={fieldErrors.slug}
                        hint={
                          draft.slug
                            ? documentRoute(1, {}, draft.slug)
                            : undefined
                        }
                        required
                        identifier
                        maxLength={128}
                        onChange={form.changeSlug}
                      />
                      {draft.manualSlug && (
                        <UiButton
                          type="button"
                          size="small"
                          variant="ghost"
                          onClick={form.resetSlug}
                        >
                          Сформировать адрес статьи из заголовка
                        </UiButton>
                      )}
                    </div>
                  </div>
                  <ArticleCreateField
                    path="description"
                    label="Краткое описание"
                    value={draft.description}
                    error={fieldErrors.description}
                    rows={3}
                    maxLength={1000}
                    onChange={form.changeDescription}
                  />
                  <div
                    className={styles.stack}
                    role="group"
                    aria-labelledby="article-create-sections"
                    data-article-field-error={sectionError ? "" : undefined}
                    aria-describedby={
                      sectionError ? "article-create-sections-error" : undefined
                    }
                    tabIndex={sectionError ? -1 : undefined}
                  >
                    <h2
                      id="article-create-sections"
                      className={styles.sectionHeading}
                    >
                      Разделы
                    </h2>
                    {sectionError && (
                      <p
                        id="article-create-sections-error"
                        className={styles.error}
                      >
                        {sectionError}
                      </p>
                    )}
                    {draft.sections.map((section, index) => (
                      <ArticleCreateSectionFields
                        key={section.key}
                        section={section}
                        index={index}
                        form={form}
                      />
                    ))}
                    <div className={styles.actions}>
                      <UiButton
                        type="button"
                        variant="secondary"
                        onClick={form.addSection}
                      >
                        Добавить раздел
                      </UiButton>
                    </div>
                  </div>
                </fieldset>
                <div className={styles.actions}>
                  <UiButton
                    type="submit"
                    disabled={operation !== null || Boolean(uncertain)}
                  >
                    {operation === "save" ? "Сохраняем…" : "Сохранить статью"}
                  </UiButton>
                  <UiButton
                    type="button"
                    ref={form.cancelRef}
                    variant="secondary"
                    disabled={operation !== null}
                    onClick={form.requestCancel}
                  >
                    Отмена
                  </UiButton>
                </div>
              </form>
            </UiSurface>
          </section>
          <UiConfirmation
            open={form.discardOpen}
            onOpenChange={form.setDiscardOpen}
            mode={mode}
            title="Выйти из создания статьи?"
            subject={draft.title.trim() || "Новая статья"}
            description="Введённые данные будут потеряны."
            tone="danger"
            confirmLabel="Выйти без сохранения"
            cancelLabel="Продолжить редактирование"
            onConfirm={form.discard}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              form.cancelRef.current?.focus();
            }}
          />
        </DocumentScreenContainer>
      )}
    </ControlPanelPreview>
  );
}
