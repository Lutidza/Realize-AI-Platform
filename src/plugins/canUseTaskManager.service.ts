/**
 * @file src/plugins/canUseTaskManager.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет текущую роль администратора без подмены пользователя запроса.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskManagerOptions } from "@realize/payload-task-manager";
import { checkRole } from "@/access/utilities";

/** Повторное admission видит удаление пользователя или отзыв роли во время сетевого чтения. */
export const canUseTaskManager: TaskManagerOptions["canUseTaskManager"] =
  async ({ req }) => {
    if (
      !req.user ||
      req.user.collection !== "users" ||
      !checkRole(["admin"], req.user)
    )
      return false;
    try {
      const current = await req.payload.findByID({
        collection: "users",
        id: req.user.id,
        depth: 0,
        overrideAccess: false,
        disableErrors: true,
        // Local API создаёт независимый req с тем же actor: чужая txn/cache не наследуются.
        user: req.user,
      });
      return Boolean(
        current &&
        String(current.id) === String(req.user.id) &&
        checkRole(["admin"], current),
      );
    } catch {
      // Закрытый или удалённый actor не получает факты провайдера через устаревший req.user.
      return false;
    }
  };
