/**
 * @file packages/payload-access-management/src/contracts/access.constants.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Регистрирует минимальные права инструментов и сроки выдаваемых доступов.
 * @see documentation/architecture/platform-access.md
 */
export const ACCESS_SCOPES = [
  "task-manager:read",
  "task-manager:write",
  "task-manager:projects",
] as const;
export const ACCESS_SCOPE_DESCRIPTORS = [
  {
    id: "task-manager:read",
    label: "Чтение Task Manager",
    description: "Просмотр доступных проектов, списков, задач и истории.",
  },
  {
    id: "task-manager:write",
    label: "Изменение задач",
    description:
      "Создание и изменение задач и списков, сохранение Git observations.",
  },
  {
    id: "task-manager:projects",
    label: "Управление проектами",
    description: "Создание и изменение проектов и состава участников.",
  },
] as const;
export const ACCESS_CLI_SECONDS = 900;
export const ACCESS_SESSION_SECONDS = 90 * 24 * 60 * 60;
export const ACCESS_DEVICE_SECONDS = 600;
export const ACCESS_DEVICE_INTERVAL = 5;
