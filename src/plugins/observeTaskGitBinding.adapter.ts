/**
 * @file src/plugins/observeTaskGitBinding.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Подключает серверное GitHub-наблюдение к разрешённым привязкам задач Realize.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskManagerOptions } from "@realize/payload-task-manager";
import {
  GitHubConnectionService,
  GitHubObservationService,
  IntegrationRuntimeRepository,
} from "@realize/payload-ai-control/server/integration-runtime";

/** Task domain уже проверил admission/membership; host ограничивает назначение интеграции. */
export const observeTaskGitBinding: NonNullable<
  TaskManagerOptions["observeGitBinding"]
> = async ({ binding, req }) => {
  if (binding.purpose !== "platform-core")
    return { status: "unavailable", reason: "repository_not_allowed" };
  const pool = req.payload.db.pool;
  if (!pool || typeof pool.query !== "function")
    return { status: "unavailable", reason: "not_configured" };
  const connection = new GitHubConnectionService(
    new IntegrationRuntimeRepository(pool),
    process.env.REALIZE_INTEGRATIONS_ENCRYPTION_KEY,
  );
  return new GitHubObservationService(connection).observe({
    repositoryId: binding.repositoryId,
    commitSha: binding.commitSha,
  });
};
