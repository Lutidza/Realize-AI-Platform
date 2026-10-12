/**
 * @file packages/payload-task-manager/src/server/mapTaskGitCi.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Выдаёт allowlist независимых CI channels без raw provider payload или внешних target URL.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskGitCiObservations } from "../contracts/TaskGitObservation.types";

/** Отдельная ошибка CI не подменяет существующие repository/commit/PR facts. */
export function mapTaskGitCi(ci: TaskGitCiObservations): TaskGitCiObservations {
  return {
    checkRuns:
      ci.checkRuns.status === "unavailable"
        ? { status: "unavailable", reason: ci.checkRuns.reason }
        : {
            status: "observed",
            totalCount: ci.checkRuns.totalCount,
            complete: ci.checkRuns.complete,
            items: ci.checkRuns.items.map((run) => ({
              id: run.id,
              name: run.name,
              headSha: run.headSha,
              status: run.status,
              conclusion: run.conclusion,
              url: run.url,
            })),
          },
    commitStatuses:
      ci.commitStatuses.status === "unavailable"
        ? { status: "unavailable", reason: ci.commitStatuses.reason }
        : {
            status: "observed",
            totalCount: ci.commitStatuses.totalCount,
            complete: ci.commitStatuses.complete,
            combinedState: ci.commitStatuses.combinedState,
            items: ci.commitStatuses.items.map((status) => ({
              id: status.id,
              context: status.context,
              state: status.state,
            })),
          },
  };
}
