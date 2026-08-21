/**
 * @file packages/payload-ai-plugin/src/admin/realizeAIAPI.ts
 * @version 2026-08-18
 * @description Owns browser transport for the Realize AI Admin DTO endpoints.
 */

import type { APIResponse } from "@realize/ai-contracts";

/** Stable browser-relative namespace exposed by the Payload AI plugin. */
export const REALIZE_AI_API_ROOT = "/api/realize-ai";

/** Requests one typed DTO and unwraps the shared API response envelope. */
export const requestRealizeAI = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${REALIZE_AI_API_ROOT}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const envelope = (await response.json()) as APIResponse<T>;
  if (!envelope.ok) throw new Error(envelope.error.message);
  return envelope.data;
};
