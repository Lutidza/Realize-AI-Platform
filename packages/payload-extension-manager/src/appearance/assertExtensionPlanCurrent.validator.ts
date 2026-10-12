/**
 * @file packages/payload-extension-manager/src/appearance/assertExtensionPlanCurrent.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет actor, TTL, catalog и независимую revision/base плана.
 * @see documentation/specifications/extension-management.md
 */
import type { AssertExtensionPlanCurrentInput } from "./ExtensionAppearance.types";
import { ExtensionManagerError } from "./ExtensionManager.error";
import { hashExtensionValue } from "./hashExtensionValue.server";
import { resolveExtensionAssignment } from "../catalog/resolveExtensionAssignment.validator";

/** Эта проверка выполняется внутри атомарной persistence mutation и при read-only preview. */
export function assertExtensionPlanCurrent(
  input: AssertExtensionPlanCurrentInput,
): void {
  const { store, catalog, actorKey, plan, nowMs } = input;
  if (plan.actorKey !== actorKey)
    throw new ExtensionManagerError("PLAN_ACTOR_MISMATCH");
  if (Date.parse(plan.expiresAt) <= nowMs)
    throw new ExtensionManagerError("PLAN_EXPIRED");
  if (plan.catalogHash !== catalog.catalogHash)
    throw new ExtensionManagerError("CATALOG_CHANGED");
  const state = store.targets[plan.target];
  if (state.revision !== plan.expectedRevision)
    throw new ExtensionManagerError("REVISION_CONFLICT");
  if (hashExtensionValue({ target: plan.target, state }) !== plan.stateHash)
    throw new ExtensionManagerError("STATE_CHANGED");
  const resolved = resolveExtensionAssignment({
    catalog,
    target: plan.target,
    selection: plan.desiredAssignment.selection,
    settings: plan.desiredAssignment.settings,
  });
  if (
    hashExtensionValue(resolved) !== hashExtensionValue(plan.desiredAssignment)
  )
    throw new ExtensionManagerError("ASSIGNMENT_UNAVAILABLE");
}
