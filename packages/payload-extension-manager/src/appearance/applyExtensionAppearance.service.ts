/**
 * @file packages/payload-extension-manager/src/appearance/applyExtensionAppearance.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Применяет один appearance plan через CAS и actor/request replay ledger.
 * @see documentation/specifications/extension-management.md
 */
import { isTemplateSettings } from "@realize/template-contracts";
import type {
  ApplyExtensionAppearanceOperation,
  ExtensionApplyReceipt,
  ApplyExtensionAppearanceResult,
} from "./ExtensionAppearance.types";
import { applyExtensionAppearanceSchema } from "./extensionAppearance.schemas";
import { EXTENSION_APPEARANCE_LIMITS } from "./extensionAppearance.constants";
import { ExtensionManagerError } from "./ExtensionManager.error";
import { validateExtensionOperation } from "./validateExtensionOperation.validator";
import { parseExtensionAppearanceStore } from "./parseExtensionAppearanceStore.validator";
import { assertExtensionPlanCurrent } from "./assertExtensionPlanCurrent.validator";
import { hashExtensionValue } from "./hashExtensionValue.server";
import { mapExtensionAppearanceReceipt } from "./mapExtensionAppearanceReceipt.mapper";

/** Replay проверяется до TTL/catalog/base; caller атомарно записывает target и immutable receipt. */
export function applyExtensionAppearance(
  input: ApplyExtensionAppearanceOperation,
): ApplyExtensionAppearanceResult {
  validateExtensionOperation(input);
  if (!isTemplateSettings(input.input))
    throw new ExtensionManagerError("INVALID_INPUT");
  const parsed = applyExtensionAppearanceSchema.safeParse(input.input);
  if (!parsed.success) throw new ExtensionManagerError("INVALID_INPUT");
  const command = parsed.data;
  const store = parseExtensionAppearanceStore(input.store);
  const fingerprint = hashExtensionValue(command);
  const prior = store.receipts.find(
    (candidate): candidate is ExtensionApplyReceipt =>
      candidate.kind === "apply" &&
      candidate.actorKey === input.actorKey &&
      candidate.requestId === input.requestId,
  );
  if (prior) {
    if (prior.inputFingerprint !== fingerprint)
      throw new ExtensionManagerError("REPLAY_CONFLICT");
    return {
      store,
      receipt: mapExtensionAppearanceReceipt(prior),
      replayed: true,
    };
  }
  const plan = store.plans.find((candidate) => candidate.id === command.planId);
  if (!plan) throw new ExtensionManagerError("PLAN_NOT_FOUND");
  if (plan.hash !== command.expectedPlanHash)
    throw new ExtensionManagerError("PLAN_HASH_MISMATCH");
  assertExtensionPlanCurrent({ ...input, store, plan });
  if (
    store.receipts.length >= EXTENSION_APPEARANCE_LIMITS.receipts ||
    store.targets[plan.target].revision >= Number.MAX_SAFE_INTEGER - 1
  )
    throw new ExtensionManagerError("LIMIT_REACHED");
  const state = store.targets[plan.target];
  const receipt: ExtensionApplyReceipt = {
    kind: "apply",
    actorKey: input.actorKey,
    requestId: input.requestId,
    inputFingerprint: fingerprint,
    planId: plan.id,
    target: plan.target,
    appliedRevision: state.revision + 1,
    assignment: plan.desiredAssignment,
    appliedAt: new Date(input.nowMs).toISOString(),
  };
  const next = parseExtensionAppearanceStore({
    ...store,
    targets: {
      ...store.targets,
      [plan.target]: {
        revision: receipt.appliedRevision,
        current: plan.desiredAssignment,
        previous: state.current,
      },
    },
    plans: store.plans.filter((candidate) => candidate.id !== plan.id),
    receipts: [...store.receipts, receipt],
  });
  return {
    store: next,
    receipt: mapExtensionAppearanceReceipt(receipt),
    replayed: false,
  };
}
