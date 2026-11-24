/**
 * @file src/app/(control-panel-preview)/reference/control-panel/ControlPanelGridPreview.component.tsx
 * @version 1.2.1
 * @date 2026-11-24
 * @description Компонует grid demo и переход к экрану чтения внутри reference preview.
 * @see documentation/specifications/realize-ai-control-panel/shell/content-grid.md
 */
import {
  UiContainer,
  UiGrid,
  UiGridItem,
  UiSurface,
  getUiButtonClassName,
} from "@realize/ui-kit";
import Link from "next/link";
import styles from "./ControlPanelGridPreview.module.css";
import { ControlPanelStatePreview } from "./ControlPanelStatePreview.component";
import type { ControlPanelPreviewState } from "@/components/admin/control-panel-preview/ControlPanelPreview.types";

/** Демоблоки не принадлежат template renderer и не становятся документом композиции редактора. */
export function ControlPanelGridPreview({
  mode,
  layoutId,
}: ControlPanelPreviewState) {
  const query = new URLSearchParams({ mode });
  if (layoutId !== undefined) query.set("layout", layoutId);
  return (
    <UiContainer className={styles.preview} data-grid-demo="root">
      <header className={styles.intro}>
        <h1>Сетка содержимого</h1>
        <p>Проверочная композиция каркаса RealizeAI Control Panel.</p>
        <p>
          <Link
            href={`/reference/control-panel/document?${query.toString()}`}
            className={getUiButtonClassName({
              variant: "secondary",
              size: "small",
            })}
          >
            Экран чтения документа
          </Link>
        </p>
      </header>

      <ControlPanelStatePreview />

      <section
        className={styles.section}
        aria-labelledby="preview-grid-columns"
      >
        <div className={styles.intro}>
          <h2 id="preview-grid-columns">12 колонок</h2>
          <p>
            Полная ширина контейнера · горизонтальные и вертикальные отступы 16
            px
          </p>
        </div>
        <UiGrid data-grid-demo="columns" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <UiGridItem key={index} span={1}>
              <UiSurface className={styles.track} />
            </UiGridItem>
          ))}
        </UiGrid>
        <UiGrid data-grid-demo="responsive">
          {["Первый блок", "Второй блок", "Третий блок"].map((title) => (
            <UiGridItem key={title} span={{ base: 12, md: 6, lg: 4 }}>
              <UiSurface className={styles.card}>
                <h3>{title}</h3>
                <p>12 → 6 → 4 колонки по доступной ширине сетки.</p>
              </UiSurface>
            </UiGridItem>
          ))}
        </UiGrid>
      </section>

      <section className={styles.section} aria-labelledby="preview-grid-nested">
        <h2 id="preview-grid-nested">Вложенная сетка</h2>
        <UiGrid data-grid-demo="outer">
          <UiGridItem span={{ base: 12, md: 8 }}>
            <UiSurface className={styles.card}>
              <h3>Основной блок</h3>
              <p>
                Вложенные элементы учитывают ширину этого блока, а не окна
                браузера.
              </p>
              <UiGrid
                data-grid-demo="nested"
                style={{
                  "--ui-grid-column-gap": "var(--ui-space-6)",
                  "--ui-grid-row-gap": "var(--ui-space-2)",
                }}
              >
                {["Вложенный блок A", "Вложенный блок B"].map((title) => (
                  <UiGridItem key={title} span={{ base: 12, md: 6 }}>
                    <UiSurface className={styles.card} tone="raised">
                      <h3>{title}</h3>
                      <p>12 → 6 колонок собственной сетки.</p>
                    </UiSurface>
                  </UiGridItem>
                ))}
                <UiGridItem data-grid-demo="default-span">
                  <UiSurface className={styles.card}>
                    <p>
                      Без span элемент занимает все 12 колонок, независимо от
                      внешнего блока.
                    </p>
                  </UiSurface>
                </UiGridItem>
              </UiGrid>
            </UiSurface>
          </UiGridItem>
          <UiGridItem span={{ base: 12, md: 4 }}>
            <UiSurface className={styles.card}>
              <h3>Дополнительный блок</h3>
              <p>
                12 → 4 колонки. Длинное содержимое переносится внутри своей
                области.
              </p>
              <code className={styles.longText}>
                realizeai-control-panel/component-with-a-long-unbroken-identifier
              </code>
            </UiSurface>
          </UiGridItem>
        </UiGrid>
      </section>

      <section
        className={styles.section}
        aria-labelledby="preview-grid-containers"
      >
        <h2 id="preview-grid-containers">Режимы контейнера</h2>
        <UiContainer variant="contained" data-grid-demo="contained">
          <UiSurface className={styles.card}>
            <h3>Ограниченный — contained</h3>
            <p>
              До 1280 px, с центрированием. Подходит для форм и составных
              экранов.
            </p>
          </UiSurface>
        </UiContainer>
        <UiContainer variant="reading" data-grid-demo="reading">
          <UiSurface className={styles.card}>
            <h3>Для чтения — reading</h3>
            <p>
              До 72ch: ширина привязана к метрикам шрифта. Документы и
              поясняющие тексты могут использовать узкий контейнер, а таблицы и
              редакторы — всю доступную область в режиме fluid.
            </p>
          </UiSurface>
        </UiContainer>
      </section>
    </UiContainer>
  );
}
