/**
 * @file packages/payload-task-manager/src/server/mapTaskGitSync.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет stored Git sync и выдаёт явный DTO для receipt и истории без storage документов.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskGitSyncDto } from "../contracts/TaskGitSync.types";
import { taskGitSyncSchema } from "../contracts/taskGitSync.schemas";
import { TaskManagerError } from "./TaskManager.error";
import { mapTaskGitObservation } from "./mapTaskGitObservation.mapper";

/** Повреждённый receipt не заменяется новым сетевым снимком с тем же ключом. */
export function mapTaskGitSync(record: unknown): TaskGitSyncDto {
  const parsed = taskGitSyncSchema.safeParse(record);
  if (!parsed.success)
    throw new TaskManagerError(
      "STORAGE_UNAVAILABLE",
      "Сохранённый Git-снимок недоступен.",
      503,
    );
  const sync = parsed.data;
  return {
    id: sync.id,
    projectId: sync.projectId,
    actorId: sync.actorId,
    taskId: sync.taskId,
    taskRevision: sync.taskRevision,
    observedAt: sync.observedAt,
    recordedAt: sync.recordedAt,
    complete: sync.complete,
    items: sync.items.map((item) => mapTaskGitObservation(item.binding, item)),
  };
}
