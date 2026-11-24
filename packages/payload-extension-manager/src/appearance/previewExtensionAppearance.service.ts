/**
 * @file packages/payload-extension-manager/src/appearance/previewExtensionAppearance.service.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Проверяет appearance plan для preview без изменения storage или назначения.
 * @see documentation/specifications/extension-management.md
 */
import type {
  PreviewExtensionAppearanceOperation,
  ExtensionAppearancePlanDto,
} from "./ExtensionAppearance.types";
import { ExtensionManagerError } from "./ExtensionManager.error";
import { validateExtensionOperation } from "./validateExtensionOperation.validator";
import { parseExtensionAppearanceStore } from "./parseExtensionAppearanceStore.validator";
import { assertExtensionPlanCurrent } from "./assertExtensionPlanCurrent.validator";
import { mapExtensionAppearancePlan } from "./mapExtensionAppearancePlan.mapper";

/** Server admission выполняется caller; pure проверка повторно связывает plan с текущим actor/base. */
export function previewExtensionAppearance(
  input: PreviewExtensionAppearanceOperation,
): ExtensionAppearancePlanDto {
  validateExtensionOperation(input);
  const store = parseExtensionAppearanceStore(input.store);
  const plan = store.plans.find((candidate) => candidate.id === input.planId);
  if (!plan) throw new ExtensionManagerError("PLAN_NOT_FOUND");
  assertExtensionPlanCurrent({ ...input, store, plan });
  return mapExtensionAppearancePlan(
    plan,
    store.targets[plan.target].current,
    input.catalog,
  );
}
