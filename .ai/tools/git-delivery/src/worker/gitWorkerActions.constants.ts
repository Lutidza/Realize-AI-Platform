/**
 * @file .ai/tools/git-delivery/src/worker/gitWorkerActions.constants.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Задаёт подключённые действия и имена ограниченных инструментов Git-воркеров.
 */

export const GIT_WORKER_ACTIONS = [
  "inspect",
  "commit",
  "push",
  "manage",
  "fetch",
  "pull",
] as const;

export const GIT_ASSIGNED_OPERATION_TOOLS = {
  manage: {
    name: "git_manage",
    description:
      "Выполняет единственную назначенную операцию управления репозиторием. Аргументы не требуются.",
  },
  fetch: {
    name: "git_fetch",
    description:
      "Получает назначенный снимок удалённой ветки через настроенное подключение. Аргументы не требуются.",
  },
  pull: {
    name: "git_pull",
    description:
      "Обновляет назначенную чистую ветку только fast-forward до проверенного commit. Аргументы не требуются.",
  },
} as const;
