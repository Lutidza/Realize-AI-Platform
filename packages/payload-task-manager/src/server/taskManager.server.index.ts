/**
 * @file packages/payload-task-manager/src/server/taskManager.server.index.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Публикует серверный facade Task Manager для host и будущих авторизованных адаптеров.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";
import type { TaskManagerOptions } from "../TaskManagerOptions.types";
import { resolveTaskManagerOptions } from "../taskManagerOptions.config";
import { TaskManagerService } from "./TaskManager.service";

/**
 * HTTP и хост используют один сервис задач с проверкой прав для каждой операции.
 * Сервис возвращает 503 до чтения или записи задачи, если запрос на изменение
 * или чтение Git-наблюдений уже участвует в транзакции. Так ошибка Payload Local API
 * при изменении задачи не откатит транзакцию вызывающего кода. После обращения к Git
 * сервис повторно проверяет доступ пользователя и ревизию задачи.
 */
export function createTaskManagerService(
  req: PayloadRequest,
  options: TaskManagerOptions,
): TaskManagerService {
  return new TaskManagerService(req, resolveTaskManagerOptions(options));
}
export { TaskManagerService } from "./TaskManager.service";
export { TaskManagerError } from "./TaskManager.error";
