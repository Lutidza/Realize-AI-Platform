/**
 * @file services/ai-execution-worker/src/sourcePromotionGitHub.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Идемпотентно создаёт draft Pull Request через bounded GitHub REST boundary.
 */

import type { PublishedPullRequest } from "./sourcePromotionTypes";

const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_RESPONSE_BYTES = 1_000_000;

/** Ошибка GitHub boundary с явной retry-классификацией. */
export class GitHubPullRequestError extends Error {
  constructor(
    message: string,
    readonly blocked: boolean,
  ) {
    super(message);
    this.name = "GitHubPullRequestError";
  }
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GitHubPullRequestError(
      "GitHub returned an invalid Pull Request object.",
      false,
    );
  }
  return value as Record<string, unknown>;
};

const readJSON = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new GitHubPullRequestError(
      "GitHub response exceeded the size limit.",
      false,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GitHubPullRequestError("GitHub returned invalid JSON.", false);
  }
};

const requestJSON = async (input: {
  body?: Record<string, unknown>;
  fetchImplementation: typeof fetch;
  method: "GET" | "POST";
  timeoutMs: number;
  token: string;
  url: string;
}): Promise<unknown> => {
  let response: Response;
  try {
    response = await input.fetchImplementation(input.url, {
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        "User-Agent": "realize-e-commerce-source-promotion",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      method: input.method,
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch {
    throw new GitHubPullRequestError(
      "GitHub Pull Request API is unavailable.",
      false,
    );
  }
  if (!response.ok) {
    throw new GitHubPullRequestError(
      `GitHub Pull Request API rejected the request (${response.status}).`,
      [401, 403, 404, 409, 422].includes(response.status),
    );
  }
  return await readJSON(response);
};

const normalizePullRequest = (
  value: unknown,
  expected: {
    baseBranch: string;
    gitCommit: string;
    headBranch: string;
  },
): PublishedPullRequest => {
  const source = asObject(value);
  const head = asObject(source.head);
  const base = asObject(source.base);
  if (
    !Number.isInteger(source.number) ||
    Number(source.number) < 1 ||
    typeof source.html_url !== "string" ||
    typeof source.draft !== "boolean" ||
    (source.state !== "open" && source.state !== "closed") ||
    head.ref !== expected.headBranch ||
    head.sha !== expected.gitCommit ||
    base.ref !== expected.baseBranch
  ) {
    throw new GitHubPullRequestError(
      "GitHub Pull Request does not match the exact source binding.",
      true,
    );
  }
  return {
    draft: source.draft,
    number: Number(source.number),
    state: source.state,
    url: source.html_url,
  };
};

/** Возвращает существующий exact PR или создаёт новый draft PR. */
export const ensureGitHubDraftPullRequest = async (
  input: {
    baseBranch: string;
    body: string;
    gitCommit: string;
    headBranch: string;
    repositorySlug: string;
    timeoutMs: number;
    title: string;
    token: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<PublishedPullRequest> => {
  const [owner] = input.repositorySlug.split("/");
  const query = new URLSearchParams({
    base: input.baseBranch,
    head: `${owner}:${input.headBranch}`,
    per_page: "10",
    state: "all",
  });
  const endpoint = `${GITHUB_API_ROOT}/repos/${input.repositorySlug}/pulls`;
  const listed = await requestJSON({
    fetchImplementation,
    method: "GET",
    timeoutMs: input.timeoutMs,
    token: input.token,
    url: `${endpoint}?${query}`,
  });
  if (!Array.isArray(listed)) {
    throw new GitHubPullRequestError(
      "GitHub Pull Request list is invalid.",
      false,
    );
  }
  if (listed.length > 1) {
    throw new GitHubPullRequestError(
      "Multiple Pull Requests exist for the deterministic source branch.",
      true,
    );
  }
  if (listed[0]) {
    const pullRequest = normalizePullRequest(listed[0], input);
    if (!pullRequest.draft || pullRequest.state !== "open") {
      throw new GitHubPullRequestError(
        "The existing exact Pull Request is not an open draft.",
        true,
      );
    }
    return pullRequest;
  }
  const created = await requestJSON({
    body: {
      base: input.baseBranch,
      body: input.body,
      draft: true,
      head: input.headBranch,
      maintainer_can_modify: false,
      title: input.title,
    },
    fetchImplementation,
    method: "POST",
    timeoutMs: input.timeoutMs,
    token: input.token,
    url: endpoint,
  });
  const pullRequest = normalizePullRequest(created, input);
  if (!pullRequest.draft || pullRequest.state !== "open") {
    throw new GitHubPullRequestError(
      "GitHub did not create an open draft Pull Request.",
      true,
    );
  }
  return pullRequest;
};
