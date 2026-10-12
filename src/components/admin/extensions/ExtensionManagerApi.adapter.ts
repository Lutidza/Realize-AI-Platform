/**
 * @file src/components/admin/extensions/ExtensionManagerApi.adapter.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Доставляет appearance DTO через общий строгий API adapter без изменения wire contract.
 * @see documentation/specifications/extension-management.md
 */
import {
  prepareExtensionAppearanceSchema,
  applyExtensionAppearanceSchema,
} from "@realize/payload-extension-manager/contracts";
import type {
  ApplyExtensionAppearanceInput,
  PrepareExtensionAppearanceInput,
} from "@realize/payload-extension-manager/contracts";
import type { ExtensionManagerTransport } from "./ExtensionManager.types";
import { ExtensionRequest } from "./ExtensionRequest.adapter";
import {
  extensionManagerSnapshotSchema,
  extensionPrepareResponseSchema,
  extensionApplyResponseSchema,
} from "./ExtensionManagerApi.schemas";

export class ExtensionManagerApi implements ExtensionManagerTransport {
  private readonly api: ExtensionRequest;
  constructor(requestFetch?: typeof fetch) {
    this.api = new ExtensionRequest(requestFetch);
  }
  snapshot(signal?: AbortSignal) {
    return this.api.request("", extensionManagerSnapshotSchema, { signal });
  }
  prepare(input: PrepareExtensionAppearanceInput, requestId: string) {
    return this.api.request(
      "/appearance/plans",
      extensionPrepareResponseSchema,
      this.api.mutation(input, prepareExtensionAppearanceSchema, requestId),
    );
  }
  apply(input: ApplyExtensionAppearanceInput, requestId: string) {
    return this.api.request(
      "/appearance/apply",
      extensionApplyResponseSchema,
      this.api.mutation(input, applyExtensionAppearanceSchema, requestId),
    );
  }
}
