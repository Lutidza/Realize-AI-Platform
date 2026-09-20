/**
 * @file src/components/admin/task-manager/reference/taskComposer.constants.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Содержит подписи типов задачи и связанных событий Git.
 * @see documentation/specifications/task-management.md
 */

export const taskTypeLabels = {
  task: "Задача",
  bug: "Дефект",
  milestone: "Веха",
} as const;
export const gitKindLabels = {
  branch: "Ветка",
  commit: "Коммит",
  push: "Push",
  pull_request: "Pull request",
  build: "Сборка CI",
  release: "Релиз",
} as const;
export const gitStatusLabels = {
  unverified: "Не проверено",
  pending: "Ожидание",
  succeeded: "Успех",
  failed: "Ошибка",
} as const;
