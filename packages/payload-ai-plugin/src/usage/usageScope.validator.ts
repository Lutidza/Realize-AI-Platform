/**
 * @file packages/payload-ai-plugin/src/usage/usageScope.validator.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Запрещает клиентскому запросу расширять installation/project/purpose scope.
 */
import type { UsageQuery } from "@realize/ai-contracts";
import type { UsageAccessScope } from "./UsageStore.types";

export function scopeUsageQuery(
  scope: UsageAccessScope,
  query: UsageQuery,
): UsageQuery {
  if (scope.view === "platform") return query;
  if (
    [
      query.systemReleaseId,
      query.overlayReleaseId,
      query.modelCatalogRevision,
      query.routerPolicyVersion,
    ].some((value) => value !== undefined)
  )
    throw new Error("USAGE_SCOPE_FORBIDDEN");
  if (
    (query.installationId !== undefined &&
      query.installationId !== scope.installationId) ||
    (query.projectId !== undefined && query.projectId !== scope.projectId) ||
    (query.purpose !== undefined && query.purpose !== "customer_runtime")
  )
    throw new Error("USAGE_SCOPE_FORBIDDEN");
  return {
    ...query,
    installationId: scope.installationId,
    projectId: scope.projectId,
    purpose: "customer_runtime",
  };
}
