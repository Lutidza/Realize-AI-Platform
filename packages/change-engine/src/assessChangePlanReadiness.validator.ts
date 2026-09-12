/**
 * @file packages/change-engine/src/assessChangePlanReadiness.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет готовность ответа ассистента для UI и серверного оформления плана.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { ChangePlanReadinessDTO } from "@realize/ai-contracts";
import { extractChangePlanPaths } from "./extractChangePlanPaths.util";

/** Повреждённый Data Lane block также закрывает оформление ответа как изменения кода. */
export const assessChangePlanReadiness = (
  content: string,
): ChangePlanReadinessDTO => {
  const plan = content.trim();
  if (/```realize-data-operation\b/.test(plan)) {
    return { status: "unavailable", reason: "data_operation" };
  }
  if (plan.length < 40) {
    return { status: "needs_clarification", reason: "too_short" };
  }
  if (extractChangePlanPaths(plan).length === 0) {
    return { status: "needs_clarification", reason: "missing_paths" };
  }
  return { status: "ready" };
};
