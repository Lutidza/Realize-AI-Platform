/**
 * @file packages/payload-task-manager/src/server/parseTaskCommand.validator.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Отклоняет неизвестные и недопустимые поля команды без раскрытия входного содержимого.
 * @see documentation/specifications/task-management-execution.md
 */
import type { z } from "zod";
import { TaskManagerError } from "./TaskManager.error";

export function parseTaskCommand<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "request");
    fieldErrors[field] = ["Проверьте значение и допустимые поля."];
  }
  throw new TaskManagerError(
    "INVALID_REQUEST",
    "Параметры задачи не соответствуют контракту.",
    422,
    fieldErrors,
  );
}
