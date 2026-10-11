/**
 * @file packages/payload-ai-plugin/src/usage/requireUsageAccess.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет отдельное право владельца и фиксирует клиентскую область на сервере.
 */
import type { PayloadRequest } from "payload";
import type { RealizeAIPluginOptions } from "../types";
import type { UsageAccessScope } from "./UsageStore.types";
import { EndpointError } from "../endpoints/http";
import { readUsageIdentity } from "./readUsageIdentity.config";

export async function requireUsageAccess(
  req: PayloadRequest,
  access: RealizeAIPluginOptions["access"],
  platform: boolean,
): Promise<UsageAccessScope> {
  if (!req.user)
    throw new EndpointError(
      "UNAUTHENTICATED",
      "Войдите в административную панель.",
      401,
    );
  const allowed = platform
    ? await access.canViewPlatformUsage?.({ req })
    : await access.canViewUsage?.({ req });
  if (!allowed)
    throw new EndpointError(
      "FORBIDDEN",
      "Нет доступа к этой аналитике расходов.",
      403,
    );
  if (platform) return { view: "platform" };
  const { installationId, projectId } = readUsageIdentity();
  return { view: "installation", installationId, projectId };
}
