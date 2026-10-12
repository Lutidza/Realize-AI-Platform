/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/mapGitHubCiObservation.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет exact-SHA CI ответы и независимо проецирует check runs и legacy statuses.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  hasGitHubObservationNextPage,
  invalidGitHubObservation as invalid,
  parseGitHubObservationId as id,
  parseGitHubObservationObject as object,
} from "./GitHubObservation.validator";
import type {
  GitHubObservationCheckRunDto,
  GitHubObservationCheckRuns,
  GitHubObservationCi,
  GitHubObservationCiMappingInput,
  GitHubObservationCommitStatusDto,
  GitHubObservationCommitStatuses,
} from "./GitHubObservation.types";

const CHECK_STATUSES = [
  "queued",
  "in_progress",
  "completed",
  "waiting",
  "requested",
  "pending",
] as const;
const CONCLUSIONS = [
  "action_required",
  "cancelled",
  "failure",
  "neutral",
  "success",
  "skipped",
  "stale",
  "timed_out",
  "startup_failure",
] as const;
const STATUS_STATES = ["error", "failure", "pending", "success"] as const;
const COMBINED_STATES = ["failure", "pending", "success"] as const;

const member = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T =>
  typeof value === "string" && allowed.some((item) => item === value);
const label = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 255 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    return invalid();
  return value;
};
const total = (value: unknown, length: number): number => {
  if (!Number.isSafeInteger(value) || Number(value) < length) return invalid();
  return Number(value);
};
function checkRuns(
  input: GitHubObservationCiMappingInput,
): GitHubObservationCheckRuns {
  const outcome = input.checkRuns;
  if (outcome.status === "unavailable")
    return { status: "unavailable", reason: outcome.reason };
  try {
    const response = object(outcome.response.value);
    if (!Array.isArray(response.check_runs) || response.check_runs.length > 20)
      return invalid();
    const seen = new Set<number>();
    const items = response.check_runs.map<GitHubObservationCheckRunDto>(
      (value: unknown) => {
        const source = object(value);
        const runId = id(source.id);
        const status = source.status;
        const conclusion = source.conclusion;
        const expectedApiUrl = `https://api.github.com/repos/${input.repositoryId}/check-runs/${runId}`;
        if (
          seen.has(runId) ||
          source.head_sha !== input.commitSha ||
          typeof source.url !== "string" ||
          source.url.toLowerCase() !== expectedApiUrl.toLowerCase() ||
          !member(status, CHECK_STATUSES) ||
          (conclusion !== null && !member(conclusion, CONCLUSIONS)) ||
          (status === "completed") !== (conclusion !== null)
        )
          return invalid();
        seen.add(runId);
        return {
          id: String(runId),
          name: label(source.name),
          headSha: input.commitSha,
          status,
          conclusion,
          url: `https://github.com/${input.repositoryId}/runs/${runId}`,
        };
      },
    );
    const totalCount = total(response.total_count, items.length);
    return {
      status: "observed",
      items,
      totalCount,
      complete:
        totalCount === items.length &&
        !hasGitHubObservationNextPage(outcome.response.link),
    };
  } catch {
    return { status: "unavailable", reason: "invalid_response" };
  }
}

function commitStatuses(
  input: GitHubObservationCiMappingInput,
): GitHubObservationCommitStatuses {
  const outcome = input.commitStatuses;
  if (outcome.status === "unavailable")
    return { status: "unavailable", reason: outcome.reason };
  try {
    const response = object(outcome.response.value);
    const repository = object(response.repository);
    const combinedState = response.state;
    if (
      response.sha !== input.commitSha ||
      repository.id !== input.repositoryNumericId ||
      typeof repository.full_name !== "string" ||
      repository.full_name.toLowerCase() !== input.repositoryId.toLowerCase() ||
      !member(combinedState, COMBINED_STATES) ||
      !Array.isArray(response.statuses) ||
      response.statuses.length > 20
    )
      return invalid();
    const seenIds = new Set<number>();
    const seenContexts = new Set<string>();
    const items = response.statuses.map<GitHubObservationCommitStatusDto>(
      (value: unknown) => {
        const source = object(value);
        const statusId = id(source.id);
        const context = label(source.context);
        const state = source.state;
        if (
          seenIds.has(statusId) ||
          seenContexts.has(context.toLowerCase()) ||
          !member(state, STATUS_STATES)
        )
          return invalid();
        seenIds.add(statusId);
        seenContexts.add(context.toLowerCase());
        return { id: String(statusId), context, state };
      },
    );
    const totalCount = total(response.total_count, items.length);
    const complete =
      totalCount === items.length &&
      !hasGitHubObservationNextPage(outcome.response.link);
    // Provider aggregate частичной страницы может учитывать не вошедшие contexts.
    if (complete) {
      const expected = items.some(
        (item) => item.state === "error" || item.state === "failure",
      )
        ? "failure"
        : !items.length || items.some((item) => item.state === "pending")
          ? "pending"
          : "success";
      if (combinedState !== expected) return invalid();
    }
    return { status: "observed", items, totalCount, combinedState, complete };
  } catch {
    return { status: "unavailable", reason: "invalid_response" };
  }
}

/** Пустые, недоступные или неполные каналы не превращаются в общий положительный CI verdict. */
export function mapGitHubCiObservation(
  input: GitHubObservationCiMappingInput,
): GitHubObservationCi {
  return { checkRuns: checkRuns(input), commitStatuses: commitStatuses(input) };
}
