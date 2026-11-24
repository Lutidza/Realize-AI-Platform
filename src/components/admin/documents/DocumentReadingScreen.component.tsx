/**
 * @file src/components/admin/documents/DocumentReadingScreen.component.tsx
 * @version 1.2.0
 * @date 2026-11-24
 * @description Отображает один документ в общей поверхности и контейнере для чтения.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { UiContainer, UiSurface } from "@realize/ui-kit";
import type { DocumentReadingScreenViewProps } from "./DocumentReadingScreen.types";
import { DocumentScreenContainer } from "./DocumentScreenContainer.component";
import { formatDocumentUpdatedDate } from "./formatDocumentUpdatedDate.util";
import styles from "./DocumentReadingScreen.module.css";

/** Чистое представление без загрузки данных, редактора и зависимости от маршрута. */
export function DocumentReadingScreen({
  title,
  description,
  updatedAt,
  sections,
  navigation,
}: DocumentReadingScreenViewProps) {
  return (
    <DocumentScreenContainer>
      {navigation && <div className={styles.navigation}>{navigation}</div>}
      <UiSurface asChild>
        <article className={styles.article}>
          <UiContainer variant="reading" className={styles.prose}>
            <header className={styles.header}>
              <h1 className={styles.title}>{title}</h1>
              {description ? (
                <p className={styles.description}>{description}</p>
              ) : null}
              <p className={styles.updatedAt}>
                Обновлено{" "}
                <time dateTime={updatedAt}>
                  {formatDocumentUpdatedDate(updatedAt)}
                </time>
              </p>
            </header>

            <div className={styles.sections}>
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className={styles.section}
                >
                  <h2 className={styles.sectionTitle}>{section.title}</h2>
                  <div className={styles.paragraphs}>
                    {section.paragraphs.map((paragraph, index) => (
                      <p key={index} className={styles.paragraph}>
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </UiContainer>
        </article>
      </UiSurface>
    </DocumentScreenContainer>
  );
}
