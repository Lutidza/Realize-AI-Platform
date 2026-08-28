/**
 * @file packages/payload-ai-plugin/src/integrations/githubProvider.ts
 * @version 2026-08-28
 * @docref ADR-0012, ADR-0013
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Verifies repository identity and ref write access for GitHub operations.
 */

import type { GitHubIntegrationTestDTO } from "@realize/ai-contracts";

const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const TEST_TIMEOUT_MS = 10_000;

type GitHubRepositoryResponse = {
  default_branch?: unknown;
  full_name?: unknown;
  permissions?: {
    push?: unknown;
  };
};

const failureMessage = (status: number): string => {
  if (status === 401) return "GitHub отклонил token.";
  if (status === 403)
    return "GitHub не разрешил проверку: проверьте scope token и rate limit.";
  if (status === 404)
    return "Репозиторий не найден или token не имеет к нему доступа.";
  return "GitHub не подтвердил доступ к репозиторию.";
};

/** Performs a read-only repository check and returns no raw provider response. */
export const testGitHubConnection = async (input: {
  repositorySlug: string;
  token: string;
}): Promise<GitHubIntegrationTestDTO> => {
  const checkedAt = new Date().toISOString();
  const [owner, repository] = input.repositorySlug.split("/");
  try {
    const response = await fetch(
      `${GITHUB_API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${input.token}`,
          "User-Agent": "realize-e-commerce-integrations",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return {
        checkedAt,
        message: failureMessage(response.status),
        repositorySlug: input.repositorySlug,
        status: "failed",
      };
    }
    const payload = (await response.json()) as GitHubRepositoryResponse;
    if (
      typeof payload.full_name !== "string" ||
      payload.full_name.toLowerCase() !== input.repositorySlug.toLowerCase()
    ) {
      return {
        checkedAt,
        message: "GitHub вернул другой repository identity.",
        repositorySlug: input.repositorySlug,
        status: "failed",
      };
    }
    if (payload.permissions?.push !== true) {
      return {
        checkedAt,
        message:
          "Доступ на чтение подтверждён, но token не разрешает запись Git refs.",
        repositorySlug: input.repositorySlug,
        status: "failed",
      };
    }
    const defaultBranch =
      typeof payload.default_branch === "string" &&
      payload.default_branch.length <= 200
        ? payload.default_branch
        : undefined;
    return {
      checkedAt,
      ...(defaultBranch ? { defaultBranch } : {}),
      message:
        "Repository доступен, запись Git refs разрешена. Pull Request и workflow permissions проверяются при первой соответствующей операции.",
      repositorySlug: input.repositorySlug,
      status: "passed",
    };
  } catch {
    return {
      checkedAt,
      message: "GitHub недоступен или не ответил вовремя.",
      repositorySlug: input.repositorySlug,
      status: "failed",
    };
  }
};
