/**
 * @file packages/payload-task-manager/src/taskManagerOptions.config.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Проверяет host-зависимости и задаёт API defaults переносимого Task plugin.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  ResolvedTaskManagerOptions,
  TaskManagerOptions,
} from "./TaskManagerOptions.types";

export function resolveTaskManagerOptions(
  options: TaskManagerOptions,
): ResolvedTaskManagerOptions {
  if (
    !options.userCollection ||
    typeof options.canUseTaskManager !== "function" ||
    typeof options.participantWhere !== "function"
  )
    throw new Error(
      "Task Manager requires explicit user collection and authorization callbacks.",
    );
  const apiRoute = options.apiRoute ?? "/task-manager";
  if (
    !/^\/[a-z0-9][a-z0-9/-]*[a-z0-9]$/.test(apiRoute) ||
    apiRoute.includes("//")
  )
    throw new Error("Invalid Task Manager API route.");
  const participantLabelField = options.participantLabelField ?? "name";
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(participantLabelField))
    throw new Error("Invalid Task Manager participant label field.");
  return { ...options, apiRoute, participantLabelField };
}
