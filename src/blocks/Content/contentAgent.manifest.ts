/**
 * @file src/blocks/Content/contentAgent.manifest.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Описывает локальный текстовый блок Content и границы его редактирования агентом.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type { PageArtifactManifest } from "@realize/ai-contracts";

export const contentAgentManifest: PageArtifactManifest = {
  id: "blocks.content",
  version: "1.1",
  kind: "block",
  title: "Текстовые колонки",
  description:
    "Локальный блок страницы: колонки с richText, размером и необязательной ссылкой.",
  schema: { path: "src/blocks/Content/config.ts", exportName: "Content" },
  renderer: {
    path: "src/blocks/Content/Component.tsx",
    exportName: "ContentBlock",
  },
  guide: {
    source: "src/blocks/Content/contentAgent.manifest.ts",
    version: "1.1",
    instructions: [
      "Экземпляр Content принадлежит layout одной страницы. Definition blocks.content описывает тип; block.id обозначает конкретное размещение, а index — его порядок в выбранной ревизии.",
      "Меняйте только предоставленные текстовым контекстом листья columns[].richText через pages.updateDraft.v1. Сохраните IDs, порядок и размеры колонок, форматирование, ссылки и остальные блоки.",
      "Настройки columns[].size, enableLink и link доступны обычному редактору Payload; текущий агентский текстовый адаптер не изменяет их и не создаёт колонки.",
      "pages.updateStructureDraft.v1 вставляет одну full-колонку из heading/body; перемещает целый Content без изменения содержимого; удаляет только полностью представимый текстовый Content. Имя блока включается в полный preview. Блок со ссылками, CSS в текстовых узлах, вложениями или неизвестными полями удалением этого среза не поддержан. Один план — одно действие, stable IDs и ревизия берутся из чтения текущего run. Проверяйте весь preview перед подтверждением.",
      "При изменении схемы Content согласуйте config, ContentBlock, текстовый адаптер, проекцию каталога и проверки сохранения структуры.",
    ],
  },
  supportedOperations: [
    { id: "pages.updateDraft.v1", version: "1.0" },
    { id: "pages.updateStructureDraft.v1", version: "1.0" },
  ],
};
