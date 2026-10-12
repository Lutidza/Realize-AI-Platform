/**
 * @file packages/payload-task-manager/src/server/readTaskGitObservations.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает ограниченные Git-факты выбранных сохранённых связей вне task transaction.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";
import type { TaskDto } from "../contracts/TaskManager.types";
import type {
  TaskGitObservationItemDto,
  TaskGitObservationsDto,
} from "../contracts/TaskGitObservation.types";
import { TASK_GIT_OBSERVATION_LIMIT } from "../contracts/taskGitObservation.constants";
import type { TaskGitBindingObserver } from "../TaskManagerOptions.types";
import { observeTaskGitBinding } from "./observeTaskGitBinding.adapter";
import { assertIndependentTaskTransaction } from "./withTaskTransaction.repository";

/** Caller выбирает task под свежим ACL и проверяет ACL/revision после чтения до выдачи или записи. */
export async function readTaskGitObservations(
  req: PayloadRequest,
  task: TaskDto,
  observe: TaskGitBindingObserver | undefined,
): Promise<TaskGitObservationsDto> {
  await assertIndependentTaskTransaction(req);
  const bindings = task.gitBindings.slice(0, TASK_GIT_OBSERVATION_LIMIT);
  const items: TaskGitObservationItemDto[] = [];
  for (let index = 0; index < bindings.length; index += 2)
    items.push(
      ...(await Promise.all(
        bindings
          .slice(index, index + 2)
          .map((binding) => observeTaskGitBinding(req, binding, observe)),
      )),
    );
  return {
    taskId: task.id,
    taskRevision: task.revision,
    observedAt: new Date().toISOString(),
    complete: task.gitBindings.length === bindings.length,
    items,
  };
}
