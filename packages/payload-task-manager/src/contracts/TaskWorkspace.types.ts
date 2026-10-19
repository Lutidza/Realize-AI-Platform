/**
 * @file packages/payload-task-manager/src/contracts/TaskWorkspace.types.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Задаёт одноразовый приём workspace-команды с устойчивой идентичностью и актуальным DTO.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskCreateInput, TaskDto } from "./TaskManager.types";

export type TaskWorkspaceCreateInput = TaskCreateInput & {
  clientTaskId: string;
};

export type TaskWorkspaceCreateResult = {
  task: TaskDto;
  disposition: "created" | "existing";
};
