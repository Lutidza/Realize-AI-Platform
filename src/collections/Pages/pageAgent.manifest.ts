/**
 * @file src/collections/Pages/pageAgent.manifest.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Описывает назначение Pages и правила использования существующего Data Lane.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type { PageArtifactManifest } from "@realize/ai-contracts";

/** Ссылки описывают установленную реализацию; разрешения проверяются отдельно при операции. */
export const pageAgentManifest: PageArtifactManifest = {
  id: "pages",
  version: "1.1",
  kind: "collection",
  title: "Страница",
  description:
    "CMS-страница с первым экраном, упорядоченными блоками и SEO-настройками.",
  schema: { path: "src/collections/Pages/index.ts", exportName: "Pages" },
  renderer: { path: "src/app/(app)/[slug]/page.tsx", exportName: "default" },
  guide: {
    source: "src/collections/Pages/pageAgent.manifest.ts",
    version: "1.1",
    instructions: [
      "Для изменения существующей страницы выберите её актуальный контекст. Используйте только точные path и before из текстовых fields; fingerprint связывает изменение с одной ревизией.",
      "pages.createDraft.v1 создаёт неопубликованный черновик из title, slug и текстовых sections. pages.updateDraft.v1 изменяет разрешённые текстовые листья после подтверждения плана через Data Lane.",
      "pages.updateStructureDraft.v1 предлагает ровно одно добавление, перемещение или удаление Content по stable block ID, fingerprint и catalogHash текущего чтения. beforeBlockID:null означает конец. Полный preview подтверждается отдельно; первый экран, настройки, формы и опубликованная версия сохраняются.",
      "Outline загружается порциями одной ревизии. Блоки вне текущей порции существуют; отсутствие записи в порции не доказывает отсутствие блока или обратных связей.",
      "Текстовый контекст v1 ограничен 128 полями и 64 KiB. Чтение структуры большой страницы не расширяет эти границы редактирования.",
      "При развитии Pages обновляйте фактическую схему, host adapters, применимые проверки и это описание. Новая запись требует зарегистрированной capability; инструкция не выдаёт полномочий.",
    ],
  },
  supportedOperations: [
    { id: "pages.createDraft.v1", version: "1.0" },
    { id: "pages.updateDraft.v1", version: "1.0" },
    { id: "pages.updateStructureDraft.v1", version: "1.0" },
  ],
};
