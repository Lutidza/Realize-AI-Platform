/**
 * @file src/plugins/taskManager.config.ts
 * @version 1.2.0
 * @date 2026-10-19
 * @description Задаёт admission и безопасный каталог участников постоянных задач в Realize.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskManagerOptions } from "@realize/payload-task-manager";
import {
  authenticateAccessRequest,
  AccessManagementError,
} from "@realize/payload-access-management/server";
import { TaskManagerError } from "@realize/payload-task-manager/server";
import { accessManagementOptions } from "./accessManagement.config";
import { observeTaskGitBinding } from "./observeTaskGitBinding.adapter";
import { canUseTaskManager } from "./canUseTaskManager.service";

/** Пилот допускает администраторов; доступ к конкретному проекту проверяет task domain. */
export const taskManagerOptions: TaskManagerOptions = {
  userCollection: "users",
  canUseTaskManager,
  authorizeRequest: async ({ req, permission }) => {
    try {
      await authenticateAccessRequest(
        req,
        accessManagementOptions,
        permission === "projects"
          ? "task-manager:projects"
          : permission === "write"
            ? "task-manager:write"
            : "task-manager:read",
      );
    } catch (error) {
      // Переносимый task domain сохраняет собственный безопасный error envelope.
      if (error instanceof AccessManagementError)
        throw new TaskManagerError(error.code, error.message, error.status);
      throw error;
    }
  },
  participantWhere: () => ({ roles: { contains: "admin" } }),
  participantLabelField: "name",
  observeGitBinding: observeTaskGitBinding,
};
