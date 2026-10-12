/**
 * @file packages/payload-task-manager/src/server/observeTaskGitBinding.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Изолирует исключения injected Git owner и проверяет его результат до публичного mapper.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";
import type { TaskGitObservationItemDto } from "../contracts/TaskGitObservation.types";
import type { TaskGitBinding } from "../contracts/TaskManager.types";
import {
  taskGitObservationItemSchema,
  taskGitObservationProviderResultSchema,
} from "../contracts/taskGitObservation.schemas";
import type { TaskGitBindingObserver } from "../TaskManagerOptions.types";
import { mapTaskGitObservation } from "./mapTaskGitObservation.mapper";

/** Provider failure остаётся результатом чтения; его message, stack и raw document не пересекают boundary. */
export async function observeTaskGitBinding(
  req: PayloadRequest,
  binding: TaskGitBinding,
  observe: TaskGitBindingObserver | undefined,
): Promise<TaskGitObservationItemDto> {
  if (!observe)
    return mapTaskGitObservation(binding, {
      status: "unavailable",
      reason: "not_configured",
    });
  let result: unknown;
  try {
    // Callback получает новую копию и не может менять DTO, выбранный для этого снимка.
    result = await observe({
      req,
      binding: {
        repositoryId: binding.repositoryId,
        commitSha: binding.commitSha,
        purpose: binding.purpose,
        source: binding.source,
        verification: binding.verification,
      },
    });
  } catch {
    return mapTaskGitObservation(binding, {
      status: "unavailable",
      reason: "provider_unavailable",
    });
  }
  try {
    const parsed = taskGitObservationProviderResultSchema.safeParse(result);
    if (parsed.success) {
      const item = mapTaskGitObservation(binding, parsed.data);
      if (taskGitObservationItemSchema.safeParse(item).success) return item;
    }
  } catch {
    // Malformed injected values могут бросать при чтении properties; details не выдаются.
  }
  return mapTaskGitObservation(binding, {
    status: "unavailable",
    reason: "invalid_response",
  });
}
