/**
 * @file src/app/(control-panel-preview)/reference/control-panel/document/documentReadingPreview.fixture.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Предоставляет локальный документ для проверки экрана чтения без CMS и сохранений.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { DocumentReadingScreenProps } from "@/components/admin/documents/DocumentReadingScreen.types";

/** Preview fixture не объявляет коллекцию документов или формат хранения платформы. */
export const documentReadingPreviewFixture = {
  title: "Начало работы с RealizeAI Control Panel",
  description:
    "Области панели, выбор макета и работа с содержимым в светлой и тёмной теме.",
  updatedAt: "2026-11-22T08:30:00.000Z",
  sections: [
    {
      id: "panel-structure",
      title: "Структура панели",
      paragraphs: [
        "Каркас организует постоянные области панели: rail, topbar, sidebar, panel-content и footer. Содержимое раздела размещается в panel-content, а геометрию областей определяет выбранный макет.",
        "Пустые области сохраняют своё место в макете. Это позволяет проверять структуру панели до подключения навигации, инструментов и других элементов.",
      ],
    },
    {
      id: "layout-selection",
      title: "Выбор макета",
      paragraphs: [
        "Макет задаёт расположение областей и доступные места для содержимого. В предпросмотре можно сравнить основной макет с вариантом без верхней панели.",
        "При смене макета документ остаётся тем же: его заголовок, дата обновления и разделы относятся к содержимому экрана.",
      ],
    },
    {
      id: "reading-and-theme",
      title: "Чтение и оформление",
      paragraphs: [
        "Ограниченная ширина текста помогает читать длинные абзацы. Заголовки разделяют материал, а дата обновления позволяет оценить его актуальность.",
        "Светлая и тёмная темы используют общие токены интерфейса. Контраст текста, фон и границы должны оставаться согласованными при переключении темы и размера окна.",
      ],
    },
  ],
} as const satisfies DocumentReadingScreenProps;
