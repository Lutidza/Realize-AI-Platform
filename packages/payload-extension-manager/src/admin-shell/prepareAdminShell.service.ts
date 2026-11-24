/**
 * @file packages/payload-extension-manager/src/admin-shell/prepareAdminShell.service.ts
 * @version 1.2.0
 * @date 2026-11-18
 * @description Готовит immutable native/custom план с UUID replay без изменения shell или appearance.
 * @see documentation/specifications/extension-management.md
 */
import { isTemplateSettings } from "@realize/template-contracts";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import { EXTENSION_APPEARANCE_LIMITS } from "../appearance/extensionAppearance.constants";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";
import { validateExtensionOperation } from "../appearance/validateExtensionOperation.validator";
import type {
  AdminShellPlan,
  AdminShellPrepareReceipt,
  PrepareAdminShellOperation,
  PrepareAdminShellResult,
} from "./AdminShell.types";
import { prepareAdminShellSchema } from "./adminShell.schemas";
import { parseAdminShellStore } from "./parseAdminShellStore.validator";
import { parseAdminShellPolicy } from "./parseAdminShellPolicy.validator";
import { hashAdminShellPolicy } from "./hashAdminShellPolicy.server";
import { captureAdminShellTemplate } from "./captureAdminShellTemplate.validator";
import { mapAdminShellPlan } from "./mapAdminShellPlan.mapper";
import { assertLayoutAssignmentWritesAllowed } from "../appearance/assertLayoutAssignmentWritesAllowed.validator";

export function prepareAdminShell(
  input: PrepareAdminShellOperation,
): PrepareAdminShellResult {
  validateExtensionOperation(input);
  if (!isTemplateSettings(input.input))
    throw new ExtensionManagerError("INVALID_INPUT");
  const parsed = prepareAdminShellSchema.safeParse(input.input);
  if (!parsed.success) throw new ExtensionManagerError("INVALID_INPUT");
  const command = parsed.data;
  const store = parseAdminShellStore(input.store);
  const fingerprint = hashExtensionValue(command);
  const prior = store.receipts.find(
    (receipt): receipt is AdminShellPrepareReceipt =>
      receipt.kind === "prepare" &&
      receipt.actorKey === input.actorKey &&
      receipt.requestId === input.requestId,
  );
  if (prior) {
    if (prior.inputFingerprint !== fingerprint)
      throw new ExtensionManagerError("REPLAY_CONFLICT");
    if (Date.parse(prior.plan.expiresAt) <= input.nowMs)
      throw new ExtensionManagerError("PLAN_EXPIRED");
    return {
      store,
      plan: mapAdminShellPlan(prior.plan, input.appearance?.catalog),
      replayed: true,
    };
  }
  const existing = store.plans.find(
    (plan) =>
      plan.actorKey === input.actorKey && plan.requestId === input.requestId,
  );
  if (existing) {
    if (existing.inputFingerprint !== fingerprint)
      throw new ExtensionManagerError("REPLAY_CONFLICT");
    if (Date.parse(existing.expiresAt) <= input.nowMs)
      throw new ExtensionManagerError("PLAN_EXPIRED");
    throw new ExtensionManagerError("INVALID_STORE");
  }
  const policy = parseAdminShellPolicy(input.policy);
  const policyHash = hashAdminShellPolicy(policy);
  if (command.expectedPolicyHash !== policyHash)
    throw new ExtensionManagerError("POLICY_CHANGED");
  if (command.expectedRevision !== store.state.revision)
    throw new ExtensionManagerError("REVISION_CONFLICT");
  const desiredMode =
    command.action === "select" ? command.mode : store.state.previous;
  if (desiredMode === null)
    throw new ExtensionManagerError("NO_PREVIOUS_ASSIGNMENT");
  if (!policy.enabled[desiredMode])
    throw new ExtensionManagerError("SHELL_UNAVAILABLE");
  const ttlMs = input.ttlMs ?? EXTENSION_APPEARANCE_LIMITS.defaultPlanTtlMs;
  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1000 ||
    ttlMs > EXTENSION_APPEARANCE_LIMITS.maximumPlanTtlMs
  )
    throw new ExtensionManagerError("INVALID_INPUT");
  const retainedPlans = store.plans.filter(
    (plan) => Date.parse(plan.expiresAt) > input.nowMs,
  );
  if (
    retainedPlans.length >= EXTENSION_APPEARANCE_LIMITS.plans ||
    store.receipts.length >= EXTENSION_APPEARANCE_LIMITS.receipts
  )
    throw new ExtensionManagerError("LIMIT_REACHED");
  if (
    store.plans.some((plan) => plan.id === input.planId) ||
    store.receipts.some(
      (receipt) =>
        receipt.kind === "prepare" && receipt.plan.id === input.planId,
    )
  )
    throw new ExtensionManagerError("INVALID_INPUT");
  const content = {
    id: input.planId,
    actorKey: input.actorKey,
    requestId: input.requestId,
    inputFingerprint: fingerprint,
    action: command.action,
    currentMode: store.state.current,
    desiredMode,
    expectedRevision: command.expectedRevision,
    stateHash: hashExtensionValue(store.state),
    policyHash,
    templateBinding:
      desiredMode === "template"
        ? captureAdminShellTemplate(input.appearance)
        : null,
    createdAt: new Date(input.nowMs).toISOString(),
    expiresAt: new Date(input.nowMs + ttlMs).toISOString(),
  };
  const plan: AdminShellPlan = {
    ...content,
    hash: hashExtensionValue(content),
  };
  const receipt: AdminShellPrepareReceipt = {
    kind: "prepare",
    actorKey: input.actorKey,
    requestId: input.requestId,
    inputFingerprint: fingerprint,
    plan,
  };
  const next = parseAdminShellStore({
    ...store,
    plans: [...retainedPlans, plan],
    receipts: [...store.receipts, receipt],
  });
  assertLayoutAssignmentWritesAllowed(next, input.layoutAssignmentWrites);
  return {
    store: next,
    plan: mapAdminShellPlan(plan, input.appearance?.catalog),
    replayed: false,
  };
}
