/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitHubObservation.types.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Определяет безопасный результат наблюдения GitHub и серверные зависимости чтения.
 * @see documentation/specifications/task-management-execution.md
 */

/** Вход содержит slug подключённого репозитория и полный SHA; произвольные URL не принимаются. */
export type GitHubObservationInput = {
  repositoryId: string;
  commitSha: string;
};

/** Ошибка отдельного CI endpoint не отменяет уже подтверждённые repository/commit/PR факты. */
export type GitHubObservationCiUnavailable = {
  status: "unavailable";
  reason: "provider_unavailable" | "invalid_response";
};

/** Check run всегда связан с точным SHA задачи; повторные runs сохраняют собственные IDs. */
export type GitHubObservationCheckRunDto = {
  id: string;
  name: string;
  headSha: string;
  status:
    | "queued"
    | "in_progress"
    | "completed"
    | "waiting"
    | "requested"
    | "pending";
  conclusion:
    | null
    | "action_required"
    | "cancelled"
    | "failure"
    | "neutral"
    | "success"
    | "skipped"
    | "stale"
    | "timed_out"
    | "startup_failure";
  url: string;
};

/** Последний legacy status одного context; внешний target_url и описания не выдаются. */
export type GitHubObservationCommitStatusDto = {
  id: string;
  context: string;
  state: "error" | "failure" | "pending" | "success";
};

export type GitHubObservationCheckRuns =
  | GitHubObservationCiUnavailable
  | {
      status: "observed";
      items: GitHubObservationCheckRunDto[];
      totalCount: number;
      /** Полнота ответа reference API в его окне, не всей истории CI или required checks. */
      complete: boolean;
    };
export type GitHubObservationCommitStatuses =
  | GitHubObservationCiUnavailable
  | {
      status: "observed";
      items: GitHubObservationCommitStatusDto[];
      totalCount: number;
      complete: boolean;
      /** Provider aggregate относится только к legacy statuses, не ко всему CI. */
      combinedState: "failure" | "pending" | "success";
    };

/** Независимые CI каналы читаются для того же полного commit SHA без вычисления общего verdict. */
export type GitHubObservationCi = {
  checkRuns: GitHubObservationCheckRuns;
  commitStatuses: GitHubObservationCommitStatuses;
};

/** Наблюдение подтверждает существование объекта, а не подпись, приёмку или доставку. */
export type GitHubObservationResult =
  | {
      status: "observed";
      repository: { id: string; fullName: string; url: string };
      commit: { sha: string; url: string };
      pullRequests: Array<{
        number: number;
        url: string;
        state: "open" | "closed";
        draft: boolean;
        merged: boolean;
      }>;
      /** Полнота страницы associated PR API; не полнота всех PR репозитория. */
      pullRequestsComplete: boolean;
      ci: GitHubObservationCi;
    }
  | {
      status: "unavailable";
      reason:
        | "not_configured"
        | "repository_not_allowed"
        | "unsupported_sha"
        | "provider_unavailable"
        | "invalid_response";
    };

/** Тестовые зависимости могут только уменьшать общие лимиты 10 секунд и 1 MB на ответ. */
export type GitHubObservationOptions = {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type GitHubObservationHttpOptions = {
  fetchImplementation: typeof fetch;
  maxResponseBytes: number;
  token: string;
  signal: AbortSignal;
};

export type GitHubObservationHttpResult = {
  repository: unknown;
  commit: unknown;
  pullRequests: unknown;
  pullRequestsLink: string | null;
  checkRuns: GitHubObservationCiHttpResult;
  commitStatuses: GitHubObservationCiHttpResult;
};

export type GitHubObservationHttpResponse = {
  value: unknown;
  link: string | null;
};

export type GitHubObservationCiHttpResult =
  | GitHubObservationCiUnavailable
  | { status: "received"; response: GitHubObservationHttpResponse };

export type GitHubObservationMappingInput = GitHubObservationHttpResult &
  GitHubObservationInput;

export type GitHubObservationCiMappingInput = Pick<
  GitHubObservationMappingInput,
  "repositoryId" | "commitSha" | "checkRuns" | "commitStatuses"
> & { repositoryNumericId: number };
