/**
 * @file src/components/admin/access-tokens/AccessApi.adapter.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Обменивается строгими DTO центра доступов через текущую browser cookie session.
 * @see documentation/architecture/platform-access.md
 */
import {
  accessContextSchema,
  accessCreateSchema,
  accessCreateResultSchema,
  accessPageSchema,
  accessResponseSchema,
  accessTokenSchema,
  deviceDecisionSchema,
  deviceRequestSchema,
  userCodeSchema,
} from "@realize/payload-access-management/contracts";
import type {
  AccessCreateInput,
  DeviceDecisionInput,
} from "@realize/payload-access-management/contracts";
import type { z } from "zod";
import { AccessClientError } from "./AccessClient.error";

/** Только same-origin browser transport; bearer и автоматические повторы отсутствуют. */
export class AccessApi {
  constructor(
    private readonly requestFetch: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    input?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 15_000);
    try {
      const response = await this.requestFetch(`/api/access${path}`, {
        method: input === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers:
          input === undefined
            ? { Accept: "application/json" }
            : {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new AccessClientError("INVALID_RESPONSE", input !== undefined);
      }
      const parsed = accessResponseSchema(schema).safeParse(body);
      if (!parsed.success)
        throw new AccessClientError("INVALID_RESPONSE", input !== undefined);
      if (!parsed.data.ok) {
        const code =
          response.status === 401
            ? "UNAUTHORIZED"
            : response.status === 403
              ? "FORBIDDEN"
              : response.status === 429
                ? "RATE_LIMITED"
                : parsed.data.error.code;
        // Error.message от сети/сервера не отражается: он может содержать отправленный секрет.
        throw new AccessClientError(
          code,
          input !== undefined && response.status >= 500,
        );
      }
      if (!response.ok)
        throw new AccessClientError("INVALID_RESPONSE", input !== undefined);
      return parsed.data.data;
    } catch (error) {
      if (error instanceof AccessClientError) throw error;
      throw new AccessClientError("NETWORK_ERROR", input !== undefined);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  context(signal?: AbortSignal) {
    return this.request("/context", accessContextSchema, undefined, signal);
  }
  tokens(ownerId?: string, after?: string | null, signal?: AbortSignal) {
    const query = new URLSearchParams();
    if (ownerId) query.set("ownerId", ownerId);
    if (after) query.set("after", after);
    return this.request(
      `/tokens${query.size ? `?${query}` : ""}`,
      accessPageSchema,
      undefined,
      signal,
    );
  }
  create(input: AccessCreateInput) {
    const parsed = accessCreateSchema.safeParse(input);
    if (!parsed.success) throw new AccessClientError("INVALID_INPUT");
    return this.request("/tokens", accessCreateResultSchema, parsed.data);
  }
  revoke(id: string) {
    return this.request(
      `/tokens/${encodeURIComponent(id)}/revoke`,
      accessTokenSchema,
      {},
    );
  }
  device(userCode: string, signal?: AbortSignal) {
    const parsed = userCodeSchema.safeParse(userCode);
    if (!parsed.success) throw new AccessClientError("INVALID_INPUT");
    return this.request(
      `/device?${new URLSearchParams({ userCode: parsed.data })}`,
      deviceRequestSchema,
      undefined,
      signal,
    );
  }
  decide(input: DeviceDecisionInput) {
    const parsed = deviceDecisionSchema.safeParse(input);
    if (!parsed.success) throw new AccessClientError("INVALID_INPUT");
    return this.request("/device/decision", deviceRequestSchema, parsed.data);
  }
}

export const accessApi = new AccessApi();
