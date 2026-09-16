/**
 * @file src/components/admin/media/reference/MediaReferenceProcessing.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Примеры партий обработки с ручным повтором ошибочной строки.
 * @see documentation/specifications/media-management-references.md
 */

import { UiBadge, UiButton, UiNotice, UiSurface } from "@realize/ui-kit";
import type { ScreenProps } from "./MediaReference.types";
import styles from "./MediaReferenceWorkbench.module.css";

export function MediaReferenceProcessing({ model }: ScreenProps) {
  return (
    <section className={styles.stack}>
      <h2>Обработка</h2>
      <UiNotice>
        Демонстрационные статусы. Обработка не подключена; файлы не
        обрабатываются.
      </UiNotice>
      {model.scenario === "empty" ? (
        <p>В этом примере нет партий обработки</p>
      ) : (
        [...new Set(model.processing.map((row) => row.batch))].map((batch) => (
          <UiSurface
            className={`${styles.stack} ${styles.insetPanel}`}
            key={batch}
          >
            <h3>{batch}</h3>
            {model.processing
              .filter((row) => row.batch === batch)
              .map((row) => (
                <div className={styles.processingRow} key={row.id}>
                  <strong>{row.name}</strong>
                  <UiBadge
                    tone={
                      row.status === "Ошибка"
                        ? "danger"
                        : row.status === "Готово"
                          ? "positive"
                          : "neutral"
                    }
                  >
                    {row.status}
                  </UiBadge>
                  {row.status === "Ошибка" && (
                    <>
                      <p>В этом сценарии изображение не удалось прочитать</p>
                      <UiButton
                        variant="secondary"
                        disabled={model.denied}
                        onClick={() => model.retryProcessing(row.id)}
                      >
                        Повторить в примере
                      </UiButton>
                    </>
                  )}
                </div>
              ))}
          </UiSurface>
        ))
      )}
    </section>
  );
}
