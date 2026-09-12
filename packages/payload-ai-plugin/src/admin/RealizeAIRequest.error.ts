/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIRequest.error.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Позволяет клиентам различать CAS-конфликт и неизвестный результат записи.
 */
import type { RealizeAIRequestFailure } from "./RealizeAIRequest.types";
/** Остаётся Error для существующих consumers, сохраняющих только message. */
export class RealizeAIRequestError extends Error {
  readonly status: RealizeAIRequestFailure["status"];
  readonly code: RealizeAIRequestFailure["code"];
  readonly details: RealizeAIRequestFailure["details"];
  constructor(message: string, failure: RealizeAIRequestFailure) {
    super(message);
    this.name = "RealizeAIRequestError";
    this.status = failure.status;
    this.code = failure.code;
    this.details = failure.details;
  }
}
