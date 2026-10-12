/**
 * @file packages/payload-task-manager/src/server/taskManager.server.index.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Публикует серверный facade Task Manager для host и будущих авторизованных адаптеров.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";
import type { TaskManagerOptions } from "../TaskManagerOptions.types";
import { resolveTaskManagerOptions } from "../taskManagerOptions.config";
import { TaskManagerService } from "./TaskManager.service";

/**
 * Возвращает одинаковый task domain для HTTP/host; права проверяются каждым методом.
 * Mutations и live Git observation требуют req без внешнего transactionID; иначе 503 до task reads/writes.
 * Payload Local API откатывает всю txn при ошибке, поэтому вложенные mutations в пилоте запрещены.
 * Git observation повторно проверяет ACL/revision после network вне caller transaction snapshot.
 */
export function createTaskManagerService(
  req: PayloadRequest,
  options: TaskManagerOptions,
): TaskManagerService {
  return new TaskManagerService(req, resolveTaskManagerOptions(options));
}
export { TaskManagerService } from "./TaskManager.service";
export { TaskManagerError } from "./TaskManager.error";
