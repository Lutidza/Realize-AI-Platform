/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/mapGitHubObservation.mapper.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Проверяет repository/SHA/PR identity и выдаёт явный allowlist наблюдения GitHub.
 * @see documentation/specifications/task-management-execution.md
 */
import { mapGitHubCiObservation } from "./mapGitHubCiObservation.mapper";
import {
  hasGitHubObservationNextPage,
  invalidGitHubObservation as invalid,
  parseGitHubObservationId as positiveId,
  parseGitHubObservationObject as object,
} from "./GitHubObservation.validator";
import type {
  GitHubObservationMappingInput,
  GitHubObservationResult,
} from "./GitHubObservation.types";

/** PR head может принадлежать fork; base repo обязателен для исходного repository identity. */
export function mapGitHubObservation(
  input: GitHubObservationMappingInput,
): Extract<GitHubObservationResult, { status: "observed" }> {
  const repository = object(input.repository);
  const repositoryId = positiveId(repository.id);
  if (
    typeof repository.full_name !== "string" ||
    repository.full_name.toLowerCase() !== input.repositoryId.toLowerCase()
  )
    return invalid();
  const commit = object(input.commit);
  if (commit.sha !== input.commitSha) return invalid();
  if (!Array.isArray(input.pullRequests) || input.pullRequests.length > 20)
    return invalid();
  const repositoryUrl = `https://github.com/${input.repositoryId}`;
  const numbers = new Set<number>();
  const pullRequests = input.pullRequests.map<
    Extract<
      GitHubObservationResult,
      { status: "observed" }
    >["pullRequests"][number]
  >((value: unknown) => {
    const source = object(value);
    const baseRepository = object(object(source.base).repo);
    const number = positiveId(source.number);
    if (
      baseRepository.id !== repositoryId ||
      typeof baseRepository.full_name !== "string" ||
      baseRepository.full_name.toLowerCase() !==
        input.repositoryId.toLowerCase() ||
      (source.state !== "open" && source.state !== "closed") ||
      typeof source.draft !== "boolean" ||
      (source.merged_at !== null &&
        (typeof source.merged_at !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
            source.merged_at,
          ) ||
          !Number.isFinite(Date.parse(source.merged_at)))) ||
      (source.merged_at !== null && source.state !== "closed") ||
      (source.merged_at !== null && source.draft !== false) ||
      numbers.has(number)
    )
      return invalid();
    numbers.add(number);
    return {
      number,
      url: `${repositoryUrl}/pull/${number}`,
      state: source.state,
      draft: source.draft,
      merged: source.merged_at !== null,
    };
  });
  return {
    status: "observed",
    repository: {
      id: String(repositoryId),
      fullName: input.repositoryId,
      url: repositoryUrl,
    },
    commit: {
      sha: input.commitSha,
      url: `${repositoryUrl}/commit/${input.commitSha}`,
    },
    pullRequests,
    pullRequestsComplete: !hasGitHubObservationNextPage(input.pullRequestsLink),
    ci: mapGitHubCiObservation({
      repositoryId: input.repositoryId,
      repositoryNumericId: repositoryId,
      commitSha: input.commitSha,
      checkRuns: input.checkRuns,
      commitStatuses: input.commitStatuses,
    }),
  };
}
