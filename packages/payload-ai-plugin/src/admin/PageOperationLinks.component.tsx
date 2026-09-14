/**
 * @file packages/payload-ai-plugin/src/admin/PageOperationLinks.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Показывает общую пару ссылок на редактор и штатный предпросмотр текущего черновика.
 */
import { getUiButtonClassName } from "@realize/ui-kit";
import type { PageOperationLinksProps } from "./PageOperationLinks.types";
import styles from "./ChangeRequestCard.module.css";

/** Переходы не подтверждают просмотр и не изменяют публикацию. */
export const PageOperationLinks = ({
  adminUrl,
  frontendPreviewUrl,
}: PageOperationLinksProps) => (
  <>
    <p className={styles.executionNotice}>
      На фронте откроется предпросмотр текущего сохранённого черновика.
    </p>
    <nav className={styles.executeAction} aria-label="Просмотр страницы">
      <a
        className={getUiButtonClassName({
          size: "small",
          variant: "secondary",
        })}
        href={adminUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Посмотреть в админке
      </a>
      <a
        className={getUiButtonClassName({
          size: "small",
          variant: "secondary",
        })}
        href={frontendPreviewUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Посмотреть на фронте
      </a>
    </nav>
  </>
);
