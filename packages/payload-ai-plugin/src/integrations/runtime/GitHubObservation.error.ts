/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitHubObservation.error.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отделяет недоступность GitHub от повреждённого ответа без сохранения внешних ошибок.
 * @see documentation/specifications/task-management-execution.md
 */

/** Ошибка не содержит credential, provider body, URL или cause внешнего клиента. */
export class GitHubObservationError extends Error {
  constructor(readonly reason: "provider_unavailable" | "invalid_response") {
    super("GitHub observation is unavailable.");
    this.name = "GitHubObservationError";
  }
}
