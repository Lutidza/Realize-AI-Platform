/**
 * @file packages/payload-ai-plugin/src/endpoints/request.ts
 * @version 2026-08-18
 * @description Owns shared JSON, idempotency and error-envelope endpoint boundaries.
 */

import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import { correlationIDFor, EndpointError, failure } from "./http";

/** Requires a bounded idempotency key for every mutating endpoint. */
export const idempotencyKeyFor = (
  req: Parameters<PayloadEndpointHandler>[0],
): string => {
  const value = req.headers.get("idempotency-key");
  if (!value || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new EndpointError(
      "INVALID_REQUEST",
      "A valid Idempotency-Key header is required.",
      400,
    );
  }
  return value;
};

/** Reads a JSON request body or rejects the boundary predictably. */
export const readBody = async (
  req: Parameters<PayloadEndpointHandler>[0],
): Promise<unknown> => {
  if (typeof req.json !== "function") {
    throw new EndpointError(
      "INVALID_REQUEST",
      "A JSON request body is required.",
      400,
    );
  }
  return await req.json();
};

/** Wraps a Payload handler in the common correlation/error envelope. */
export const withHandler = (
  handler: (
    req: Parameters<PayloadEndpointHandler>[0],
    correlationID: string,
  ) => Promise<Response>,
): PayloadEndpointHandler => {
  return async (req) => {
    const correlationID = correlationIDFor(req);
    try {
      return await handler(req, correlationID);
    } catch (error) {
      return failure(error, correlationID, req.payload.logger);
    }
  };
};
