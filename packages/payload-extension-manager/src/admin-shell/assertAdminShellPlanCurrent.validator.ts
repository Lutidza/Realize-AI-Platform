/**
 * @file packages/payload-extension-manager/src/admin-shell/assertAdminShellPlanCurrent.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет shell actor/TTL/policy/base и atomic readonly appearance dependency.
 * @see documentation/specifications/extension-management.md
 */
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";
import { hashAdminShellPolicy } from "./hashAdminShellPolicy.server";
import { captureAdminShellTemplate } from "./captureAdminShellTemplate.validator";
import type { AssertAdminShellPlanInput } from "./AdminShell.types";

/** Caller читает shell и appearance под общей собственной транзакцией; здесь нет I/O. */
export function assertAdminShellPlanCurrent(
  input: AssertAdminShellPlanInput,
): void {
  const { plan, store } = input;
  if (plan.actorKey !== input.actorKey)
    throw new ExtensionManagerError("PLAN_ACTOR_MISMATCH");
  if (Date.parse(plan.expiresAt) <= input.nowMs)
    throw new ExtensionManagerError("PLAN_EXPIRED");
  if (plan.policyHash !== hashAdminShellPolicy(input.policy))
    throw new ExtensionManagerError("POLICY_CHANGED");
  if (!input.policy.enabled[plan.desiredMode])
    throw new ExtensionManagerError("SHELL_UNAVAILABLE");
  if (store.state.revision !== plan.expectedRevision)
    throw new ExtensionManagerError("REVISION_CONFLICT");
  if (hashExtensionValue(store.state) !== plan.stateHash)
    throw new ExtensionManagerError("STATE_CHANGED");
  if (plan.currentMode !== store.state.current)
    throw new ExtensionManagerError("STATE_CHANGED");
  if (plan.desiredMode === "template") {
    const current = captureAdminShellTemplate(input.appearance);
    const expected = plan.templateBinding;
    if (!expected) throw new ExtensionManagerError("INVALID_STORE");
    if (current.catalogHash !== expected.catalogHash)
      throw new ExtensionManagerError("CATALOG_CHANGED");
    if (current.appearanceRevision !== expected.appearanceRevision)
      throw new ExtensionManagerError("REVISION_CONFLICT");
    if (hashExtensionValue(current) !== hashExtensionValue(expected))
      throw new ExtensionManagerError("STATE_CHANGED");
  }
}
