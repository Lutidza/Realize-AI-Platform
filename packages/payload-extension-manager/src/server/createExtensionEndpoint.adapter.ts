/**
 * @file packages/payload-extension-manager/src/server/createExtensionEndpoint.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Применяет единый ACL/Origin/envelope контракт endpoints менеджера.
 * @see documentation/specifications/extension-management.md
 */
import type { Endpoint, PayloadRequest } from "payload";
import { ExtensionManagerHttpError } from "./ExtensionManagerHttp.error";
import { mapExtensionError } from "./mapExtensionError.mapper";

/** Service factory вызывается в запросе; unknown errors никогда не выдаются клиенту. */
export function createExtensionEndpoint<Service>(input: {
  path: string;
  method: "get" | "post";
  createService: (req: PayloadRequest) => Service;
  authorize: (service: Service) => Promise<unknown>;
  work: (service: Service, req: PayloadRequest) => Promise<unknown>;
}): Endpoint {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  return {
    path: input.path,
    method: input.method,
    handler: async (req) => {
      try {
        const service = input.createService(req);
        await input.authorize(service);
        if (new URL(req.url ?? "http://localhost").searchParams.size)
          throw new ExtensionManagerHttpError("INVALID_REQUEST");
        if (input.method === "post") {
          const origin = req.headers.get("origin");
          const allowed = new Set([
            new URL(req.url ?? "http://localhost").origin,
            ...(req.payload.config.csrf ?? []),
            ...(req.payload.config.serverURL
              ? [req.payload.config.serverURL]
              : []),
          ]);
          if (origin && !allowed.has(origin))
            throw new ExtensionManagerHttpError("FORBIDDEN");
        }
        return Response.json(
          { ok: true, data: await input.work(service, req) },
          { headers },
        );
      } catch (error) {
        const safe = mapExtensionError(error);
        return Response.json(
          { ok: false, error: safe.error },
          { status: safe.status, headers },
        );
      }
    },
  };
}
