/**
 * @file packages/payload-extension-manager/src/appearance/prepareExtensionAppearance.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Готовит immutable appearance plan с actor/UUID replay без изменения назначения.
 * @see documentation/specifications/extension-management.md
 */
import { isTemplateSettings } from "@realize/template-contracts";
import type {
  PrepareExtensionAppearanceOperation,
  ExtensionAppearancePlan,
  ExtensionPrepareReceipt,
  PrepareExtensionAppearanceResult,
} from "./ExtensionAppearance.types";
import { prepareExtensionAppearanceSchema } from "./extensionAppearance.schemas";
import { EXTENSION_APPEARANCE_LIMITS } from "./extensionAppearance.constants";
import { ExtensionManagerError } from "./ExtensionManager.error";
import { parseExtensionAppearanceStore } from "./parseExtensionAppearanceStore.validator";
import { validateExtensionOperation } from "./validateExtensionOperation.validator";
import { hashExtensionValue } from "./hashExtensionValue.server";
import { resolveExtensionAssignment } from "../catalog/resolveExtensionAssignment.validator";
import { mapExtensionAppearancePlan } from "./mapExtensionAppearancePlan.mapper";

/** Persistence обязан сохранить новый plan/prepare receipt одной транзакцией и не evict ledger ключи. */
export function prepareExtensionAppearance(
  input: PrepareExtensionAppearanceOperation,
): PrepareExtensionAppearanceResult {
  validateExtensionOperation(input);
  if (!isTemplateSettings(input.input))
    throw new ExtensionManagerError("INVALID_INPUT");
  const parsed = prepareExtensionAppearanceSchema.safeParse(input.input);
  if (!parsed.success) throw new ExtensionManagerError("INVALID_INPUT");
  const command = parsed.data;
  const store = parseExtensionAppearanceStore(input.store);
  const fingerprint = hashExtensionValue(command);
  const receipt = store.receipts.find(
    (candidate): candidate is ExtensionPrepareReceipt =>
      candidate.kind === "prepare" &&
      candidate.actorKey === input.actorKey &&
      candidate.requestId === input.requestId,
  );
  if (receipt) {
    if (receipt.inputFingerprint !== fingerprint)
      throw new ExtensionManagerError("REPLAY_CONFLICT");
    if (Date.parse(receipt.plan.expiresAt) <= input.nowMs)
      throw new ExtensionManagerError("PLAN_EXPIRED");
    return {
      store,
      plan: mapExtensionAppearancePlan(receipt.plan, receipt.current),
      replayed: true,
    };
  }
  // При неполном ledger прежняя pending identity не разрешает создать второй план.
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
  if (command.expectedCatalogHash !== input.catalog.catalogHash)
    throw new ExtensionManagerError("CATALOG_CHANGED");
  const state = store.targets[command.target];
  if (state.revision !== command.expectedRevision)
    throw new ExtensionManagerError("REVISION_CONFLICT");
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
      (candidate) =>
        candidate.kind === "prepare" && candidate.plan.id === input.planId,
    )
  )
    throw new ExtensionManagerError("INVALID_INPUT");
  let desiredAssignment;
  if (command.action === "assign")
    desiredAssignment = resolveExtensionAssignment({
      catalog: input.catalog,
      target: command.target,
      selection: command.selection,
      settings: command.settings,
    });
  else {
    if (!state.previous)
      throw new ExtensionManagerError("NO_PREVIOUS_ASSIGNMENT");
    desiredAssignment = resolveExtensionAssignment({
      catalog: input.catalog,
      target: command.target,
      selection: state.previous.selection,
      settings: state.previous.settings,
    });
    if (
      hashExtensionValue(desiredAssignment) !==
      hashExtensionValue(state.previous)
    )
      throw new ExtensionManagerError("ASSIGNMENT_UNAVAILABLE");
  }
  const content = {
    id: input.planId,
    actorKey: input.actorKey,
    requestId: input.requestId,
    inputFingerprint: fingerprint,
    action: command.action,
    target: command.target,
    expectedRevision: command.expectedRevision,
    stateHash: hashExtensionValue({ target: command.target, state }),
    catalogHash: input.catalog.catalogHash,
    desiredAssignment,
    createdAt: new Date(input.nowMs).toISOString(),
    expiresAt: new Date(input.nowMs + ttlMs).toISOString(),
  };
  const plan: ExtensionAppearancePlan = {
    ...content,
    hash: hashExtensionValue(content),
  };
  const prepareReceipt: ExtensionPrepareReceipt = {
    kind: "prepare",
    actorKey: input.actorKey,
    requestId: input.requestId,
    inputFingerprint: fingerprint,
    plan,
    current: state.current,
  };
  const next = parseExtensionAppearanceStore({
    ...store,
    plans: [...retainedPlans, plan],
    receipts: [...store.receipts, prepareReceipt],
  });
  return {
    store: next,
    plan: mapExtensionAppearancePlan(plan, state.current),
    replayed: false,
  };
}
