/**
 * @file src/components/admin/task-manager/TaskGitCi.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Описывает представление независимых CI channels для проверенного SHA.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskGitObservationItemDto } from "@realize/payload-task-manager/contracts";
export type TaskGitCiProps = {
  ci: Extract<TaskGitObservationItemDto, { status: "observed" }>["ci"];
};
