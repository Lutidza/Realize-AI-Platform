/**
 * @file src/components/admin/extensions/InstalledTemplatesApi.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает строгий installed inventory через существующий авторизованный API adapter.
 */
import { installedTemplatesSnapshotSchema } from "@realize/payload-extension-manager/contracts";
import type { InstalledTemplatesTransport } from "./InstalledTemplates.types";
import { ExtensionRequest } from "./ExtensionRequest.adapter";

export class InstalledTemplatesApi implements InstalledTemplatesTransport {
  private readonly api: ExtensionRequest;
  constructor(requestFetch?: typeof fetch) {
    this.api = new ExtensionRequest(requestFetch);
  }
  snapshot(signal?: AbortSignal) {
    return this.api.request(
      "/installed-templates",
      installedTemplatesSnapshotSchema,
      { signal },
    );
  }
}
