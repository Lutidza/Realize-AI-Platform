/**
 * @file src/components/admin/documents/ArticleCreateSectionFields.component.tsx
 * @version 1.0.0
 * @date 2026-11-23
 * @description Показывает поля раздела статьи и действия с порядком разделов и абзацев.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { UiButton } from "@realize/ui-kit";
import { ArticleCreateField } from "./ArticleCreateField.component";
import type {
  ArticleRowActionsProps,
  ArticleSectionFieldsProps,
} from "./ArticleCreateForm.types";
import styles from "./ArticleCreateForm.module.css";

function RowActions({
  index,
  count,
  name,
  move,
  remove,
}: ArticleRowActionsProps) {
  if (count < 2) return null;
  return (
    <div className={styles.actions}>
      <UiButton
        type="button"
        variant="ghost"
        size="small"
        disabled={index === 0}
        aria-label={`Переместить ${name} выше`}
        onClick={() => move(-1)}
      >
        Выше
      </UiButton>
      <UiButton
        type="button"
        variant="ghost"
        size="small"
        disabled={index === count - 1}
        aria-label={`Переместить ${name} ниже`}
        onClick={() => move(1)}
      >
        Ниже
      </UiButton>
      <UiButton
        type="button"
        variant="ghost"
        size="small"
        aria-label={`Удалить ${name}`}
        onClick={remove}
      >
        Удалить
      </UiButton>
    </div>
  );
}

/** Вложенный fieldset задаёт контекст повторяющимся подписям полей. */
export function ArticleCreateSectionFields({
  index,
  section,
  form,
}: ArticleSectionFieldsProps) {
  const sectionPath = `sections.${index}`;
  const titlePath = `${sectionPath}.title`;
  const anchorPath = `${sectionPath}.anchor`;
  const paragraphsPath = `${sectionPath}.paragraphs`;
  const error =
    form.fieldErrors[sectionPath] ?? form.fieldErrors[paragraphsPath];

  return (
    <fieldset
      className={styles.articleSection}
      data-article-field-error={error ? "" : undefined}
      aria-describedby={
        error ? `article-create-${sectionPath}-error` : undefined
      }
      tabIndex={error ? -1 : undefined}
    >
      <legend>Раздел {index + 1}</legend>
      {error && (
        <p id={`article-create-${sectionPath}-error`} className={styles.error}>
          {error}
        </p>
      )}
      <RowActions
        index={index}
        count={form.draft.sections.length}
        name={`раздел ${index + 1}`}
        move={(offset) => form.moveSection(index, offset)}
        remove={() => form.removeSection(index)}
      />
      <div className={styles.columns}>
        <ArticleCreateField
          path={titlePath}
          label="Заголовок раздела"
          value={section.title}
          error={form.fieldErrors[titlePath]}
          required
          maxLength={160}
          onChange={(value) => form.changeSectionTitle(index, value)}
        />
        <div className={styles.address}>
          <ArticleCreateField
            path={anchorPath}
            label="Адрес раздела"
            value={section.anchor}
            error={form.fieldErrors[anchorPath]}
            hint={section.anchor ? `#${section.anchor}` : undefined}
            required
            identifier
            maxLength={128}
            onChange={(value) => form.changeAnchor(index, value)}
          />
          {section.manualAnchor && (
            <UiButton
              type="button"
              size="small"
              variant="ghost"
              onClick={() => form.resetAnchor(index)}
            >
              Сформировать адрес раздела из заголовка
            </UiButton>
          )}
        </div>
      </div>
      <div className={styles.stack}>
        {section.paragraphs.map((paragraph, paragraphIndex) => {
          const path = `${paragraphsPath}.${paragraphIndex}.text`;
          return (
            <div key={paragraph.key} className={styles.address}>
              <ArticleCreateField
                path={path}
                label={`Абзац ${paragraphIndex + 1}`}
                value={paragraph.text}
                error={form.fieldErrors[path]}
                rows={4}
                required
                onChange={(value) =>
                  form.changeParagraph(index, paragraphIndex, value)
                }
              />
              <RowActions
                index={paragraphIndex}
                count={section.paragraphs.length}
                name={`абзац ${paragraphIndex + 1} раздела ${index + 1}`}
                move={(offset) =>
                  form.moveParagraph(index, paragraphIndex, offset)
                }
                remove={() => form.removeParagraph(index, paragraphIndex)}
              />
            </div>
          );
        })}
        <div className={styles.actions}>
          <UiButton
            type="button"
            variant="secondary"
            size="small"
            onClick={() => form.addParagraph(index)}
          >
            Добавить абзац
          </UiButton>
        </div>
      </div>
    </fieldset>
  );
}
