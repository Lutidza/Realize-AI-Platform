/**
 * @file packages/payload-extension-manager/src/admin-shell/applyAdminShell.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Применяет shell CAS либо exact UUID replay; custom appearance остаётся readonly.
 * @see documentation/specifications/extension-management.md
 */
import { isTemplateSettings } from "@realize/template-contracts";
import { validateExtensionOperation } from "../appearance/validateExtensionOperation.validator";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import { EXTENSION_APPEARANCE_LIMITS } from "../appearance/extensionAppearance.constants";
import type {
  AdminShellApplyReceipt,
  ApplyAdminShellOperation,
  ApplyAdminShellResult,
} from "./AdminShell.types";
import { applyAdminShellSchema } from "./adminShell.schemas";
import { parseAdminShellStore } from "./parseAdminShellStore.validator";
import { assertAdminShellPlanCurrent } from "./assertAdminShellPlanCurrent.validator";
import { mapAdminShellReceipt } from "./mapAdminShellReceipt.mapper";

/** Persistence атомарно записывает только shell state и immutable shell receipt. */
export function applyAdminShell(
  input: ApplyAdminShellOperation,
): ApplyAdminShellResult {
  validateExtensionOperation(input);
  if (!isTemplateSettings(input.input))
    throw new ExtensionManagerError("INVALID_INPUT");
  const parsed = applyAdminShellSchema.safeParse(input.input);
  if (!parsed.success) throw new ExtensionManagerError("INVALID_INPUT");
  const command = parsed.data;
  const store = parseAdminShellStore(input.store);
  const fingerprint = hashExtensionValue(command);
  const prior = store.receipts.find(
    (receipt): receipt is AdminShellApplyReceipt =>
      receipt.kind === "apply" &&
      receipt.actorKey === input.actorKey &&
      receipt.requestId === input.requestId,
  );
  if (prior) {
    if (prior.inputFingerprint !== fingerprint)
      throw new ExtensionManagerError("REPLAY_CONFLICT");
    return { store, receipt: mapAdminShellReceipt(prior), replayed: true };
  }
  const plan = store.plans.find((candidate) => candidate.id === command.planId);
  if (!plan) throw new ExtensionManagerError("PLAN_NOT_FOUND");
  if (plan.hash !== command.expectedPlanHash)
    throw new ExtensionManagerError("PLAN_HASH_MISMATCH");
  assertAdminShellPlanCurrent({ ...input, store, plan });
  if (
    store.receipts.length >= EXTENSION_APPEARANCE_LIMITS.receipts ||
    store.state.revision >= Number.MAX_SAFE_INTEGER - 1
  )
    throw new ExtensionManagerError("LIMIT_REACHED");
  const receipt: AdminShellApplyReceipt = {
    kind: "apply",
    actorKey: input.actorKey,
    requestId: input.requestId,
    inputFingerprint: fingerprint,
    planId: plan.id,
    appliedRevision: store.state.revision + 1,
    mode: plan.desiredMode,
    appliedAt: new Date(input.nowMs).toISOString(),
  };
  const next = parseAdminShellStore({
    ...store,
    state: {
      revision: receipt.appliedRevision,
      current: plan.desiredMode,
      previous: store.state.current,
    },
    plans: store.plans.filter((candidate) => candidate.id !== plan.id),
    receipts: [...store.receipts, receipt],
  });
  return {
    store: next,
    receipt: mapAdminShellReceipt(receipt),
    replayed: false,
  };
}
