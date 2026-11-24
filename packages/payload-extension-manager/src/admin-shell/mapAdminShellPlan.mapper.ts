/**
 * @file packages/payload-extension-manager/src/admin-shell/mapAdminShellPlan.mapper.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Возвращает detached plan DTO без actor, request UUID и fingerprint.
 * @see documentation/specifications/extension-management.md
 */
import type { ExtensionCatalog } from "../catalog/ExtensionCatalog.types";
import { getExtensionTemplateReadiness } from "../catalog/assertExtensionAssignmentReady.validator";
import type { AdminShellPlan, AdminShellPlanDto } from "./AdminShell.types";

export function mapAdminShellPlan(
  plan: AdminShellPlan,
  catalog?: ExtensionCatalog,
): AdminShellPlanDto {
  const readiness =
    catalog && plan.templateBinding
      ? getExtensionTemplateReadiness(
          catalog,
          plan.templateBinding.assignment.selection,
        )
      : undefined;
  return {
    ...(readiness === undefined ? {} : { readiness }),
    planId: plan.id,
    planHash: plan.hash,
    action: plan.action,
    currentMode: plan.currentMode,
    desiredMode: plan.desiredMode,
    expectedRevision: plan.expectedRevision,
    policyHash: plan.policyHash,
    templateBinding:
      plan.templateBinding === null
        ? null
        : structuredClone(plan.templateBinding),
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
  };
}
