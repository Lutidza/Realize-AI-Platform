/**
 * @file packages/payload-task-manager/src/server/TaskWorkspaceIntake.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Принимает исходную workspace-команду единожды и возвращает актуальную задачу при точном повторе.
 * @see documentation/specifications/task-management-execution.md
 */
import { createHash } from "node:crypto";
import type { TaskWorkspaceCreateResult } from "../contracts/TaskWorkspace.types";
import { taskWorkspaceCreateSchema } from "../contracts/taskManager.schemas";
import { TaskManagerError } from "./TaskManager.error";
import { TaskWorkspaceIntakeRepository } from "./TaskWorkspaceIntake.repository";
import type { TaskWorkspaceIntakeContext } from "./TaskWorkspaceIntake.types";
import { parseTaskCommand } from "./parseTaskCommand.validator";
import { withTaskTransaction } from "./withTaskTransaction.repository";

/** Не использует actor-bound receipts: одна source identity принадлежит самой задаче. */
export class TaskWorkspaceIntakeService {
  constructor(private readonly context: TaskWorkspaceIntakeContext) {}

  async create(value: unknown): Promise<TaskWorkspaceCreateResult> {
    const actor = await this.context.authorize();
    const { clientTaskId, ...input } = parseTaskCommand(
      taskWorkspaceCreateSchema,
      value,
    );
    // Zod задаёт порядок полей и нормализует строки до вычисления неизменяемого hash.
    const createHash = createHashForCommand(input);
    return withTaskTransaction<TaskWorkspaceCreateResult>(
      this.context.req,
      actor.id,
      input.projectId,
      async () => {
        await this.context.authorize();
        await this.context.authorizeProject(input.projectId, actor);
        const existing = await new TaskWorkspaceIntakeRepository(
          this.context.req,
        ).findSource(clientTaskId);
        if (existing) {
          if (
            existing.createHash !== createHash ||
            existing.task.projectId !== input.projectId ||
            existing.task.listId !== input.listId
          )
            throw new TaskManagerError(
              "WORKSPACE_SOURCE_CONFLICT",
              "Исходный идентификатор уже связан с другой командой задачи.",
              409,
            );
          return { task: existing.task, disposition: "existing" };
        }
        const task = await this.context.createTask(input, actor, {
          workspaceSourceId: clientTaskId,
          workspaceCreateHash: createHash,
        });
        return { task, disposition: "created" };
      },
      // Global source lock также сериализует конкурирующие запросы разных проектов/actors.
      [`workspace-source:${clientTaskId}`],
    );
  }
}

function createHashForCommand(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
