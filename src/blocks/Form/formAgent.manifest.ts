/**
 * @file src/blocks/Form/formAgent.manifest.ts
 * @version 1.0.0
 * @date 2026-09-13
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
      "Текущий пилот читает структуру FormBlock и проверенную ссылку на форму. Изменение вступления, замена формы, перестановка блока и редактирование общей формы не предоставлены.",
      "При изменении текста соседнего Content сохраняйте FormBlock целиком. Недоступная ссылка не означает удаление формы; контекст не оценивает полный список её потребителей.",
      "Для развития виджета согласуйте config и FormBlock renderer. Будущие операции локального размещения и общей формы должны иметь отдельные проверяемые границы доступа.",
    ],
  },
  supportedOperations: [],
};
