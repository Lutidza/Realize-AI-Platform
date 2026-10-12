/**
 * @file packages/payload-extension-manager/src/server/extensionManagerEndpoints.controller.ts
 * @version 1.2.0
 * @date 2026-10-12
 * @description Связывает authenticated HTTP с каталогом и транзакционным appearance service.
 * @see documentation/specifications/extension-management.md
 */
import type { Endpoint, PayloadRequest } from "payload";
import type { ResolvedExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import { ExtensionManagerService } from "./ExtensionManager.service";
import { createExtensionEndpoint } from "./createExtensionEndpoint.adapter";
import { createAdminShellEndpoints } from "./adminShellEndpoints.controller";
import { readExtensionBody } from "./readExtensionBody.adapter";
import { InstalledTemplatesService } from "./InstalledTemplates.service";

/** Generic collection CRUD закрыт; endpoints возвращают только DTO allowlist. */
export function createExtensionManagerEndpoints(
  options: ResolvedExtensionManagerOptions,
): Endpoint[] {
  const endpoint = (
    path: string,
    method: "get" | "post",
    action: "read" | "appearance" | "install",
    work: (
      service: ExtensionManagerService,
      req: PayloadRequest,
    ) => Promise<unknown>,
  ): Endpoint =>
    createExtensionEndpoint({
      path: `${options.apiRoute}${path}`,
      method,
      createService: (req) => new ExtensionManagerService(req, options),
      authorize: (service) => service.authorize(action),
      work,
    });
  const requestId = (req: PayloadRequest) =>
    req.headers.get("idempotency-key") ?? "";
  return [
    endpoint("", "get", "read", (service) => service.snapshot()),
    createExtensionEndpoint({
      path: `${options.apiRoute}/installed-templates`,
      method: "get",
      createService: (req) => new InstalledTemplatesService(req, options),
      authorize: (service) => service.authorize(),
      work: (service) => service.snapshot(),
    }),
    endpoint("/appearance/plans", "post", "appearance", async (service, req) =>
      service.prepare(await readExtensionBody(req), requestId(req)),
    ),
    endpoint("/appearance/plans/:id", "get", "appearance", (service, req) =>
      service.preview(String(req.routeParams?.id ?? "")),
    ),
    endpoint("/appearance/apply", "post", "appearance", async (service, req) =>
      service.apply(await readExtensionBody(req), requestId(req)),
    ),
    ...createAdminShellEndpoints(options),
    endpoint("/install", "post", "install", async (service, req) =>
      service.install(await readExtensionBody(req)),
    ),
  ];
}
