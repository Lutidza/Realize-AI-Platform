/**
 * @file packages/engineering-runtime/src/runtime/EngineeringFailure.error.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Возвращает безопасные ошибки без приватных путей и причин внешних портов.
 * @see documentation/architecture/engineering-operations.md
 */
import type {
  EngineeringErrorCode,
  EngineeringErrorDto,
} from "../contracts/EngineeringState.types.ts";

/** Только фиксированные сообщения runtime пересекают публичную границу. */
export class EngineeringFailure extends Error {
  constructor(
    readonly code: EngineeringErrorCode,
    message: string,
    readonly phase = "admission",
  ) {
    super(message);
  }
  toDTO(operationId: string | null = null): EngineeringErrorDto {
    return {
      code: this.code,
      message: this.message,
      retryable: this.code === "DEPENDENCY_UNAVAILABLE",
      phase: this.phase,
      operationId,
      detailsRef: null,
    };
  }
}
export function failure(
  code: EngineeringErrorCode,
  message: string,
  phase?: string,
): never {
  throw new EngineeringFailure(code, message, phase);
}
