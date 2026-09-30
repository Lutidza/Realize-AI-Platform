/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/designWorkshopClient.constants.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Задаёт подписи поддерживаемых видов дизайна и HTTP endpoint Мастерской.
 * @see documentation/specifications/design-workshop.md
 */

export const WORKSHOP_API_PATH = "/api/realize-ai/workshop/projects";
export const WORKSHOP_BRIEF_LABELS = {
  goal: "Задача",
  audience: "Аудитория",
  screens: "Экраны",
  states: "Состояния",
  constraints: "Ограничения",
  acceptanceCriteria: "Критерии готовности",
} as const;
export const WORKSHOP_KINDS = {
  reference: "Референс",
  interface: "Интерфейс",
  component: "Компонент",
  module: "Модуль",
  theme: "Тема",
} as const;
export const WORKSHOP_TARGETS = {
  admin: "Админка",
  frontend: "Сайт",
  shared: "Админка и сайт",
} as const;
