/**
 * @file packages/payload-task-manager/src/contracts/TaskGitObservation.types.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Определяет отдельный live-снимок Git-фактов без изменения сохранённых связей задачи.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskGitBinding } from "./TaskManager.types";

/** Недоступность не доказывает отсутствие коммита или доступ пользователя к репозиторию. */
export type TaskGitObservationUnavailableReason =
  | "not_configured"
  | "repository_not_allowed"
  | "unsupported_sha"
  | "provider_unavailable"
  | "invalid_response";

/** Авторитетный ID провайдера отличается от полного имени в ручной привязке. */
export type TaskGitRepositoryObservation = {
  id: string;
  fullName: string;
  url: string;
};
export type TaskGitCommitObservation = { sha: string; url: string };
export type TaskGitPullRequestObservation = {
  number: number;
  url: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
};

/** CI относится к точному SHA привязки; состояние текущего PR head из него не выводится. */
export type TaskGitCiUnavailable = {
  status: "unavailable";
  reason: "provider_unavailable" | "invalid_response";
};
export type TaskGitCheckRunObservation = {
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
export type TaskGitCommitStatusObservation = {
  id: string;
  context: string;
  state: "error" | "failure" | "pending" | "success";
};
export type TaskGitCiObservations = {
  checkRuns:
    | TaskGitCiUnavailable
    | {
        status: "observed";
        items: TaskGitCheckRunObservation[];
        totalCount: number;
        complete: boolean;
      };
  commitStatuses:
    | TaskGitCiUnavailable
    | {
        status: "observed";
        items: TaskGitCommitStatusObservation[];
        totalCount: number;
        complete: boolean;
        combinedState: "failure" | "pending" | "success";
      };
};

/** PR page может быть неполной; observed не означает принятие, выпуск или deployment задачи. */
export type TaskGitObservationProviderResult =
  | {
      status: "unavailable";
      reason: TaskGitObservationUnavailableReason;
    }
  | {
      status: "observed";
      repository: TaskGitRepositoryObservation;
      commit: TaskGitCommitObservation;
      pullRequests: TaskGitPullRequestObservation[];
      pullRequestsComplete: boolean;
      ci: TaskGitCiObservations;
    };

export type TaskGitObservationItemDto = {
  binding: TaskGitBinding;
} & TaskGitObservationProviderResult;

/** complete описывает охват связей; pullRequestsComplete — отдельный охват PR одной связи. */
export type TaskGitObservationsDto = {
  taskId: string;
  taskRevision: number;
  observedAt: string;
  complete: boolean;
  items: TaskGitObservationItemDto[];
};
