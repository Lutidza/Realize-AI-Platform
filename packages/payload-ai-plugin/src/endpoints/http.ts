/**
 * @file packages/payload-ai-plugin/src/endpoints/http.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Формирует API envelopes и различает конфликт policy, ошибку запроса и сбой сервиса.
 */

import { randomUUID } from "node:crypto";

import type { APIErrorCode, APIResponse } from "@realize/ai-contracts";
import { ContractValidationError } from "@realize/ai-contracts";
import { AIConfigurationPolicyError } from "@realize/change-engine";
import type { PayloadRequest } from "payload";

export class EndpointError extends Error {
  constructor(
    readonly code: APIErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EndpointError";
  }
}

export const correlationIDFor = (req: PayloadRequest): string => {
  const supplied = req.headers.get("x-correlation-id");
  return supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : randomUUID();
};

export const success = <T>(
  data: T,
  correlationID: string,
  status = 200,
): Response => {
  const body: APIResponse<T> = { correlationID, data, ok: true };
  return Response.json(body, {
    headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationID },
    status,
  });
};

export const failure = (
  error: unknown,
  correlationID: string,
  logger?: { error: (value: unknown) => void },
): Response => {
  let endpointError: EndpointError;

  if (error instanceof EndpointError) endpointError = error;
  else if (error instanceof AIConfigurationPolicyError) {
    endpointError = new EndpointError(
      "CONFLICT",
      "Сохранённый снимок AI policy недоступен или несовместим. Создайте новый запуск или план.",
      409,
    );
  } else if (
    error instanceof ContractValidationError ||
    error instanceof SyntaxError
  ) {
    endpointError = new EndpointError("INVALID_REQUEST", error.message, 400);
  } else {
    logger?.error({
      correlationID,
      err: error,
      msg: "Realize AI endpoint failed.",
    });
    endpointError = new EndpointError(
      "INTERNAL_ERROR",
      "Internal AI service error.",
      500,
    );
  }

  const body: APIResponse<never> = {
    correlationID,
    error: {
      code: endpointError.code,
      details: endpointError.details,
      message: endpointError.message,
    },
    ok: false,
  };
  return Response.json(body, {
    headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationID },
    status: endpointError.status,
  });
};
