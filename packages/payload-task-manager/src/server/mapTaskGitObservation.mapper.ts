/**
 * @file packages/payload-task-manager/src/server/mapTaskGitObservation.mapper.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Формирует явный allowlist Git DTO из проверенного результата внешнего owner.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  TaskGitObservationItemDto,
  TaskGitObservationProviderResult,
} from "../contracts/TaskGitObservation.types";
import type { TaskGitBinding } from "../contracts/TaskManager.types";
import { mapTaskGitCi } from "./mapTaskGitCi.mapper";

/** Копии отделяют adapter от сохранённой manual-привязки и не выдают закрытые provider поля. */
export function mapTaskGitObservation(
  binding: TaskGitBinding,
  result: TaskGitObservationProviderResult,
): TaskGitObservationItemDto {
  const publicBinding: TaskGitBinding = {
    repositoryId: binding.repositoryId,
    commitSha: binding.commitSha,
    purpose: binding.purpose,
    source: binding.source,
    verification: binding.verification,
  };
  if (result.status === "unavailable")
    return {
      binding: publicBinding,
      status: "unavailable",
      reason: result.reason,
    };
  return {
    binding: publicBinding,
    status: "observed",
    repository: {
      id: result.repository.id,
      fullName: result.repository.fullName,
      url: result.repository.url,
    },
    commit: { sha: result.commit.sha, url: result.commit.url },
    pullRequests: result.pullRequests.map((pr) => ({
      number: pr.number,
      url: pr.url,
      state: pr.state,
      draft: pr.draft,
      merged: pr.merged,
    })),
    pullRequestsComplete: result.pullRequestsComplete,
    ci: mapTaskGitCi(result.ci),
  };
}
