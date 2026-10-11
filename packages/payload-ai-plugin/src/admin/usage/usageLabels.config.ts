/**
 * @file packages/payload-ai-plugin/src/admin/usage/usageLabels.config.ts
 * @version 1.1.0
 * @date 2026-10-06
 * @description Согласует подписи измерений, статусов и видов затрат в админке.
 */
export const usageBasisLabels: Record<string, string> = {
  provider: "Модели",
  infrastructure: "Инфраструктура",
  customer: "Клиентская оценка",
};
export const usageOutcomeLabels: Record<string, string> = {
  running: "Выполняется",
  completed: "Завершено",
  failed: "Ошибка",
  cancelled: "Отменено",
};
export const usageSourceLabels: Record<string, string> = {
  chat: "Чат",
  workflow: "Процесс",
  execution: "Исполнитель",
  review: "Проверка",
  build: "Проверки и сборка",
  preview: "Предпросмотр",
  development: "Разработка",
  evaluation: "Оценка качества",
};
export const usagePurposeLabels: Record<string, string> = {
  customer_runtime: "Работа установки",
  development: "Разработка платформы",
  evaluation: "Оценка качества",
};
export const usageGroupingLabels = {
  byPurpose: "По назначению",
  bySource: "По типам работы",
  byAgent: "По админским агентам",
  byModel: "По моделям",
  byWorkflow: "По процессам",
} as const;
export const usageGroupingFilters = {
  byPurpose: "purpose",
  bySource: "source",
  byAgent: "agentProfileKey",
  byModel: "model",
  byWorkflow: "workflowKey",
} as const;
