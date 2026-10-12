/**
 * @file src/components/admin/system-shell/readSystemAdminShellPreview.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Получает actor-bound shell plan через повторно авторизованный service.
 * @see documentation/specifications/extension-management.md
 */
import "server-only";
import configPromise from "@payload-config";
import { headers } from "next/headers";
import { createLocalReq, getPayload } from "payload";
import {
  AdminShellService,
  resolveExtensionManagerOptions,
} from "@realize/payload-extension-manager/server";
import { extensionManagerOptions } from "@/plugins/extensionManager.config";

export async function readSystemAdminShellPreview(planId: string) {
  const requestHeaders = await headers();
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: requestHeaders });
  const req = await createLocalReq({ user: user ?? undefined }, payload);
  return new AdminShellService(
    req,
    resolveExtensionManagerOptions(extensionManagerOptions),
  ).preview(planId);
}
