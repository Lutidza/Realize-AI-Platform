/**
 * @file packages/payload-extension-manager/src/server/adminShellEndpoints.controller.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Регистрирует защищённый отдельный API выбора оболочки Admin.
 * @see documentation/specifications/extension-management.md
 */
import type { PayloadRequest } from "payload";
import type { ResolvedExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import { AdminShellService } from "./AdminShell.service";
import { createExtensionEndpoint } from "./createExtensionEndpoint.adapter";
import { readExtensionBody } from "./readExtensionBody.adapter";

export function createAdminShellEndpoints(
  options: ResolvedExtensionManagerOptions,
) {
  if (!options.adminShell) return [];
  const endpoint = (
    path: string,
    method: "get" | "post",
    action: "read" | "appearance",
    work: (service: AdminShellService, req: PayloadRequest) => Promise<unknown>,
  ) =>
    createExtensionEndpoint({
      path: `${options.apiRoute}/admin-shell${path}`,
      method,
      createService: (req) => new AdminShellService(req, options),
      authorize: (service) => service.authorize(action),
      work,
    });
  const id = (req: PayloadRequest) => req.headers.get("idempotency-key") ?? "";
  return [
    endpoint("", "get", "read", (service) => service.snapshot()),
    endpoint("/plans", "post", "appearance", async (service, req) =>
      service.prepare(await readExtensionBody(req), id(req)),
    ),
    endpoint("/plans/:id", "get", "appearance", (service, req) =>
      service.preview(String(req.routeParams?.id ?? "")),
    ),
    endpoint("/apply", "post", "appearance", async (service, req) =>
      service.apply(await readExtensionBody(req), id(req)),
    ),
  ];
}
