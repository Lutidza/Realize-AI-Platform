/**
 * @file src/plugins/taskManager.config.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Задаёт admission и безопасный каталог участников постоянных задач в Realize.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskManagerOptions } from "@realize/payload-task-manager";
import { observeTaskGitBinding } from "./observeTaskGitBinding.adapter";
import { canUseTaskManager } from "./canUseTaskManager.service";

/** Пилот допускает администраторов; доступ к конкретному проекту проверяет task domain. */
export const taskManagerOptions: TaskManagerOptions = {
  userCollection: "users",
  canUseTaskManager,
  participantWhere: () => ({ roles: { contains: "admin" } }),
  participantLabelField: "name",
  observeGitBinding: observeTaskGitBinding,
};
