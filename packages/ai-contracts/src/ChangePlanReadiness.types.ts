/**
 * @file packages/ai-contracts/src/ChangePlanReadiness.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт публичную готовность ответа к оформлению плана изменения кода.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

/** Серверная проверка содержимого ответа; готовность не заменяет подтверждение плана. */
export type ChangePlanReadinessDTO =
  | { status: "ready" }
  | {
      status: "needs_clarification";
      reason: "missing_paths" | "too_short";
    }
  | {
      status: "unavailable";
      reason: "data_operation" | "not_assistant";
    };
