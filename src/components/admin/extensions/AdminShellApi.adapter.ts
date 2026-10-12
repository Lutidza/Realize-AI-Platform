/**
 * @file src/components/admin/extensions/AdminShellApi.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Доставляет независимые shell DTO через общий строгий API adapter.
 */
import {
  adminShellSnapshotSchema,
  prepareAdminShellSchema,
  applyAdminShellSchema,
  adminShellPrepareResponseSchema,
  adminShellApplyResponseSchema,
} from "@realize/payload-extension-manager/contracts";
import type {
  PrepareAdminShellInput,
  ApplyAdminShellInput,
} from "@realize/payload-extension-manager/contracts";
import type { AdminShellTransport } from "./AdminShellPicker.types";
import { ExtensionRequest } from "./ExtensionRequest.adapter";

export class AdminShellApi implements AdminShellTransport {
  private readonly api: ExtensionRequest;
  constructor(requestFetch?: typeof fetch) {
    this.api = new ExtensionRequest(requestFetch);
  }
  snapshot(signal?: AbortSignal) {
    return this.api.request("/admin-shell", adminShellSnapshotSchema, {
      signal,
    });
  }
  prepare(input: PrepareAdminShellInput, requestId: string) {
    return this.api.request(
      "/admin-shell/plans",
      adminShellPrepareResponseSchema,
      this.api.mutation(input, prepareAdminShellSchema, requestId),
    );
  }
  apply(input: ApplyAdminShellInput, requestId: string) {
    return this.api.request(
      "/admin-shell/apply",
      adminShellApplyResponseSchema,
      this.api.mutation(input, applyAdminShellSchema, requestId),
    );
  }
}
