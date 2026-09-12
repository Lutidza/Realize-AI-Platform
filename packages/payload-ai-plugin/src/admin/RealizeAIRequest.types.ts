/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIRequest.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Сохраняет безопасные признаки HTTP-ошибки без ответа transport целиком.
 */
import type { APIErrorCode } from "@realize/ai-contracts";
export type RealizeAIRequestFailure = {
  status: number;
  code?: APIErrorCode;
  details?: Record<string, unknown>;
};
