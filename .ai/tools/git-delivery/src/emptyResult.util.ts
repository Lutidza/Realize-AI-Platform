/**
 * @file .ai/tools/git-delivery/src/emptyResult.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Создаёт исходный безопасный результат локального Git-обработчика.
 */

import type { Result } from "./GitDelivery.types.ts";

/** До чтения контекста результат не приписывает операции неизвестные данные. */
export function emptyResult(): Result {
  return {
    version: 1,
    requestId: null,
    action: null,
    status: "blocked",
    branch: null,
    commit: null,
    commitCreated: false,
    pushStatus: "not_requested",
    changes: { items: [], truncated: false },
    fingerprint: null,
    checks: [],
    errorCode: null,
    summary: "",
    retryable: false,
  };
}
