/**
 * @file packages/payload-extension-manager/src/admin-shell/previewAdminShell.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет native/custom кандидат без переключения host или изменения settings.
 * @see documentation/specifications/extension-management.md
 */
import { validateExtensionOperation } from "../appearance/validateExtensionOperation.validator";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import type {
  AdminShellPlanDto,
  PreviewAdminShellOperation,
} from "./AdminShell.types";
import { parseAdminShellStore } from "./parseAdminShellStore.validator";
import { assertAdminShellPlanCurrent } from "./assertAdminShellPlanCurrent.validator";
import { mapAdminShellPlan } from "./mapAdminShellPlan.mapper";

export function previewAdminShell(
  input: PreviewAdminShellOperation,
): AdminShellPlanDto {
  validateExtensionOperation(input);
  const store = parseAdminShellStore(input.store);
  const plan = store.plans.find((candidate) => candidate.id === input.planId);
  if (!plan) throw new ExtensionManagerError("PLAN_NOT_FOUND");
  assertAdminShellPlanCurrent({ ...input, store, plan });
  return mapAdminShellPlan(plan);
}
