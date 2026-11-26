/**
 * @file src/blocks/Form/formAgent.manifest.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Описывает размещение формы и отделяет локальные настройки от общей записи forms.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type { PageArtifactManifest } from "@realize/ai-contracts";

export const formAgentManifest: PageArtifactManifest = {
  id: "blocks.formBlock",
  version: "1.0",
  kind: "block",
  title: "Форма",
  description:
    "Виджет формы в layout страницы: локальное вступление и ссылка на общую запись forms.",
  schema: { path: "src/blocks/Form/config.ts", exportName: "FormBlock" },
  renderer: { path: "src/blocks/Form/Component.tsx", exportName: "FormBlock" },
  guide: {
    source: "src/blocks/Form/formAgent.manifest.ts",
    version: "1.0",
    instructions: [
      "block.id относится к размещению FormBlock на странице. form ссылается на отдельную общую запись forms; другие страницы могут использовать ту же форму.",
      "enableIntro и introContent — локальные настройки размещения. Поля формы, обработка отправки и уведомления принадлежат forms и не включаются в контекст страницы.",
      "Pages передаёт агенту настройки FormBlock и проверяет право пользователя на чтение связанной формы перед выдачей её ID. Через Pages агент не может менять вступление или ссылку на форму, перемещать FormBlock или редактировать общую форму.",
      "При изменении текста соседнего Content сохраняйте FormBlock целиком. Недоступная ссылка не означает удаление формы; контекст не оценивает полный список её потребителей.",
      "Для развития виджета согласуйте config и FormBlock renderer. Будущие операции локального размещения и общей формы должны иметь отдельные проверяемые границы доступа.",
    ],
  },
  supportedOperations: [],
};
