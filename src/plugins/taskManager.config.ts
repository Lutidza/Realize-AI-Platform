/**
 * @file src/plugins/taskManager.config.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Задаёт admission и безопасный каталог участников постоянных задач в Realize.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskManagerOptions } from "@realize/payload-task-manager";
import { checkRole } from "@/access/utilities";

/** Пилот допускает администраторов; доступ к конкретному проекту проверяет task domain. */
export const taskManagerOptions: TaskManagerOptions = {
  userCollection: "users",
  canUseTaskManager: ({ req }) =>
    Boolean(req.user && checkRole(["admin"], req.user)),
  participantWhere: () => ({ roles: { contains: "admin" } }),
  participantLabelField: "name",
};
