/**
 * @file src/components/admin/documents/DocumentListScreen.component.tsx
 * @version 1.1.2
 * @date 2026-11-24
 * @description Показывает страницу документов и ссылки списка в общем содержимом панели.
 * @see documentation/specifications/realize-ai-control-panel/documents/list.md
 */
import { UiSurface } from "@realize/ui-kit";
import type { DocumentListPage } from "./DocumentList.types";
import { DocumentScreenContainer } from "./DocumentScreenContainer.component";
import { DocumentSectionLink } from "./DocumentSectionLink.component";
import { formatDocumentUpdatedDate } from "./formatDocumentUpdatedDate.util";
import styles from "./DocumentListScreen.module.css";

/** Получает подготовленные метаданные; выборка документов принадлежит серверу маршрута. */
export function DocumentListScreen({
  items,
  page,
  totalPages,
}: DocumentListPage) {
  return (
    <DocumentScreenContainer>
      <section aria-labelledby="document-list-title" className={styles.section}>
        <header className={styles.header}>
          <h1 id="document-list-title" className={styles.title}>
            Документы
          </h1>
          <DocumentSectionLink page={page} create>
            Создать статью
          </DocumentSectionLink>
        </header>
        <UiSurface className={styles.surface}>
          {items.length === 0 ? (
            <p className={styles.empty}>Документов пока нет</p>
          ) : (
            <ul className={styles.list} role="list">
              {items.map(({ slug, title, description, updatedAt }) => (
                <li className={styles.row} key={slug}>
                  <div className={styles.summary}>
                    <h2 className={styles.documentTitle}>
                      <DocumentSectionLink page={page} slug={slug}>
                        {title}
                      </DocumentSectionLink>
                    </h2>
                    {description && (
                      <p className={styles.description}>{description}</p>
                    )}
                  </div>
                  <p className={styles.updatedAt}>
                    Обновлено{" "}
                    <time dateTime={updatedAt}>
                      {formatDocumentUpdatedDate(updatedAt)}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <nav aria-label="Страницы документов" className={styles.pagination}>
              {page > 1 && (
                <DocumentSectionLink page={page - 1}>
                  Предыдущая
                </DocumentSectionLink>
              )}
              <span>
                Страница {page} из {totalPages}
              </span>
              {page < totalPages && (
                <DocumentSectionLink page={page + 1}>
                  Следующая
                </DocumentSectionLink>
              )}
            </nav>
          )}
        </UiSurface>
      </section>
    </DocumentScreenContainer>
  );
}
