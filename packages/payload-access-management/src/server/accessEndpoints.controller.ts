/**
 * @file packages/payload-access-management/src/server/accessEndpoints.controller.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Связывает строгие HTTP команды с browser, device и credential сервисами.
 * @see documentation/architecture/platform-access.md
 */
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import type { ResolvedAccessManagementOptions } from "../AccessManagementOptions.types";
import {
  deviceSecretInputSchema,
  sessionRefreshSchema,
  userCodeSchema,
} from "../contracts/access.schemas";
import { AccessManagementService } from "./AccessManagement.service";
import { AccessDeviceService } from "./AccessDevice.service";
import { AccessCredentialService } from "./AccessCredential.service";
import { AccessManagementError } from "./AccessManagement.error";
import { readAccessBody } from "./readAccessBody.adapter";
import { parseAccessInput } from "./parseAccessInput.validator";
import { readAccessSession } from "./readAccessSession.service";
const empty = z.strictObject({});
const page = z.strictObject({
  ownerId: z.string().min(1).max(128).optional(),
  after: z.string().min(1).max(256).optional(),
});
const deviceQuery = z.strictObject({ userCode: userCodeSchema });
const headers = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
function query<T>(req: PayloadRequest, schema: z.ZodType<T>): T {
  const params = new URL(req.url ?? "http://localhost").searchParams;
  for (const key of new Set(params.keys()))
    if (params.getAll(key).length !== 1)
      throw new AccessManagementError(
        "INVALID_REQUEST",
        "Параметры запроса повторяются.",
        422,
      );
  return parseAccessInput(schema, Object.fromEntries(params));
}
/** Ни JWT, ни credentials не возвращаются в ошибках; middleware не регистрирует глобальную auth strategy. */
export function createAccessEndpoints(
  options: ResolvedAccessManagementOptions,
): Endpoint[] {
  const endpoint = (
    path: string,
    method: "get" | "post",
    work: (req: PayloadRequest) => Promise<unknown>,
    hasQuery = false,
  ): Endpoint => ({
    path: `/access${path}`,
    method,
    handler: async (req) => {
      try {
        if (!hasQuery) query(req, empty);
        return Response.json({ ok: true, data: await work(req) }, { headers });
      } catch (error) {
        const safe =
          error instanceof AccessManagementError
            ? error
            : new AccessManagementError(
                "STORAGE_UNAVAILABLE",
                "Хранилище доступов временно недоступно.",
                503,
              );
        return Response.json(
          { ok: false, error: { code: safe.code, message: safe.message } },
          { status: safe.status, headers },
        );
      }
    },
  });
  return [
    endpoint("/context", "get", (req) =>
      new AccessManagementService(req, options).context(),
    ),
    endpoint(
      "/tokens",
      "get",
      (req) => {
        const input = query(req, page);
        return new AccessManagementService(req, options).list(
          input.ownerId,
          input.after ?? null,
        );
      },
      true,
    ),
    endpoint("/tokens", "post", async (req) =>
      new AccessManagementService(req, options).create(
        await readAccessBody(req),
      ),
    ),
    endpoint("/tokens/:id/revoke", "post", async (req) => {
      parseAccessInput(empty, await readAccessBody(req));
      const id = parseAccessInput(z.uuid(), req.routeParams?.id);
      return new AccessManagementService(req, options).revoke(id);
    }),
    endpoint("/device", "post", async (req) =>
      new AccessDeviceService(req, options).start(await readAccessBody(req)),
    ),
    endpoint(
      "/device",
      "get",
      (req) =>
        new AccessDeviceService(req, options).read(
          query(req, deviceQuery).userCode,
        ),
      true,
    ),
    endpoint("/device/decision", "post", async (req) =>
      new AccessDeviceService(req, options).decide(await readAccessBody(req)),
    ),
    endpoint("/device/token", "post", async (req) =>
      new AccessDeviceService(req, options).poll(
        parseAccessInput(deviceSecretInputSchema, await readAccessBody(req))
          .deviceCode,
      ),
    ),
    endpoint("/device/cancel", "post", async (req) =>
      new AccessDeviceService(req, options).cancel(
        parseAccessInput(deviceSecretInputSchema, await readAccessBody(req))
          .deviceCode,
      ),
    ),
    endpoint("/session/refresh", "post", async (req) =>
      new AccessCredentialService(req, options).refresh(
        parseAccessInput(sessionRefreshSchema, await readAccessBody(req))
          .refreshToken,
      ),
    ),
    endpoint("/session/logout", "post", async (req) =>
      new AccessCredentialService(req, options).logout(
        parseAccessInput(sessionRefreshSchema, await readAccessBody(req))
          .refreshToken,
      ),
    ),
    endpoint("/session", "get", (req) => readAccessSession(req, options)),
  ];
}
