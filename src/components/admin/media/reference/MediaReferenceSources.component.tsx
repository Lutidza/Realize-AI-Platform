/**
 * @file src/components/admin/media/reference/MediaReferenceSources.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Обзор макета и происхождение источников предыдущего исследования.
 * @see documentation/specifications/media-management-references.md
 */

import { UiNotice, UiSurface } from "@realize/ui-kit";
import { ExternalLink } from "lucide-react";
import { sources } from "./mediaReference.fixtures";
import styles from "./MediaReferenceWorkbench.module.css";

export function MediaReferenceSources() {
  return (
    <section className={styles.stack}>
      <h2>Источники</h2>
      <UiNotice>
        По предыдущему исследованию, 14 сентября 2026 года; официальная
        документация. Внешние скриншоты и работающие интерфейсы не
        просматривались.
      </UiNotice>
      <p>
        Макет объединяет библиотеку, сведения, добавление файлов, профили,
        очередь, выбор для блока и источники. Состояние примера переключается в
        обзорной справке над разделами.
      </p>
      <p>
        Папки, параметры вариантов, связи и статусы партий являются примерами.
        Серверная загрузка и обработка не подключены.
      </p>
      {sources.map((source) => (
        <UiSurface
          key={source.url}
          className={`${styles.stack} ${styles.insetPanel}`}
        >
          <h3>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title} <ExternalLink aria-hidden="true" size={16} />
              <span className={styles.visuallyHidden}>
                {" "}
                — откроется в новой вкладке
              </span>
            </a>
          </h3>
          <p>{source.text}</p>
        </UiSurface>
      ))}
    </section>
  );
}
