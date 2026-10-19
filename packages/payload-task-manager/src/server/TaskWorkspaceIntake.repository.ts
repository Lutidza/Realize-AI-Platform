/**
 * @file packages/payload-task-manager/src/server/TaskWorkspaceIntake.repository.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Читает приватный source mapping задачи после авторизации проекта внутри intake transaction.
 * @see documentation/specifications/task-management-execution.md
 */
import type { CollectionSlug, PayloadRequest } from "payload";
import { TASKS_SLUG } from "../taskManager.constants";
import { TaskManagerError } from "./TaskManager.error";
import { mapTask } from "./mapTask.mapper";
import type { TaskWorkspaceSourceRow } from "./TaskWorkspaceIntake.types";

export class TaskWorkspaceIntakeRepository {
  constructor(private readonly req: PayloadRequest) {}

  async findSource(sourceId: string) {
    const result = await this.req.payload.find({
      collection: TASKS_SLUG as CollectionSlug,
      where: { workspaceSourceId: { equals: sourceId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
    const row = result.docs[0] as unknown as TaskWorkspaceSourceRow | undefined;
    if (!row) return null;
    if (
      typeof row.workspaceCreateHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(row.workspaceCreateHash)
    )
      throw new TaskManagerError(
        "STORAGE_UNAVAILABLE",
        "Не удалось прочитать исходную команду задачи.",
        503,
      );
    return { task: mapTask(row.record), createHash: row.workspaceCreateHash };
  }
}
