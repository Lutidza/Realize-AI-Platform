/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitHubObservation.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет общую структуру, числовую identity и пагинацию GitHub observation ответов.
 * @see documentation/specifications/task-management-execution.md
 */
import { GitHubObservationError } from "./GitHubObservation.error";

export const invalidGitHubObservation = (): never => {
  throw new GitHubObservationError("invalid_response");
};

export const parseGitHubObservationObject = (
  value: unknown,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalidGitHubObservation();
  return value as Record<string, unknown>;
};

export const parseGitHubObservationId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    return invalidGitHubObservation();
  return Number(value);
};

/** Link используется только для полноты; переход по provider URL не выполняется. */
export const hasGitHubObservationNextPage = (link: string | null): boolean => {
  if (!link) return false;
  for (const relation of link.matchAll(
    /(?:^|;)\s*rel\s*=\s*(?:"([^"]*)"|([^;,\s]+))/gi,
  )) {
    if (
      (relation[1] ?? relation[2]).toLowerCase().split(/\s+/).includes("next")
    )
      return true;
  }
  return false;
};
