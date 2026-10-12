/**
 * @file packages/payload-extension-manager/src/admin-shell/mapAdminShellPlan.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Возвращает detached plan DTO без actor, request UUID и fingerprint.
 * @see documentation/specifications/extension-management.md
 */
import type { AdminShellPlan, AdminShellPlanDto } from "./AdminShell.types";

export function mapAdminShellPlan(plan: AdminShellPlan): AdminShellPlanDto {
  return {
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
