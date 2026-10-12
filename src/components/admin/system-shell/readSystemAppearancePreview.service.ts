/**
 * @file src/components/admin/system-shell/readSystemAppearancePreview.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает actor-bound план по native Payload session без передачи user document в UI.
 * @see documentation/specifications/extension-management.md
 */
import "server-only";
import configPromise from "@payload-config";
import { headers } from "next/headers";
import { createLocalReq, getPayload } from "payload";
import {
  ExtensionManagerService,
  resolveExtensionManagerOptions,
} from "@realize/payload-extension-manager/server";
import { extensionManagerOptions } from "@/plugins/extensionManager.config";

/** Route предварительно выполняет requireSystemAdmin; service повторно проверяет appearance ACL. */
export async function readSystemAppearancePreview(planId: string) {
  const requestHeaders = await headers();
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: requestHeaders });
  const req = await createLocalReq({ user: user ?? undefined }, payload);
  return new ExtensionManagerService(
    req,
    resolveExtensionManagerOptions(extensionManagerOptions),
  ).preview(planId);
}
