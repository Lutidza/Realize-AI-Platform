/**
 * @file packages/ai-contracts/src/usage/usageLedger.schemas.ts
 * @version 1.1.0
 * @date 2026-10-06
 * @description Проверяет bounded usage contracts, точные денежные единицы и происхождение тарифов.
 */
import { z } from "zod";
import { usageGroupKeys } from "./usageGrouping.config";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
const version = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/)
  .nullable();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: false });
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
export const usageNanosSchema = z.string().regex(/^(0|[1-9][0-9]{0,20})$/);
export const usageCurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const purpose = z.enum(["development", "evaluation", "customer_runtime"]);
const basis = z.enum(["provider", "infrastructure", "customer"]);
const sourceRef = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:/._-]*$/);

export const usageTokensSchema = z
  .strictObject({
    inputTokens: count,
    cachedInputTokens: count,
    outputTokens: count,
    reasoningOutputTokens: count,
    totalTokens: count,
  })
  .refine(
    (value) =>
      (value.inputTokens === null ||
        value.cachedInputTokens === null ||
        value.cachedInputTokens <= value.inputTokens) &&
      (value.outputTokens === null ||
        value.reasoningOutputTokens === null ||
        value.reasoningOutputTokens <= value.outputTokens),
    "Cached/reasoning counters must be subsets of input/output.",
  );

export const usageContextSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  installationId: id,
  projectId: id,
  actorId: id.nullable(),
  purpose,
  source: z.enum([
    "chat",
    "workflow",
    "execution",
    "review",
    "build",
    "preview",
    "development",
    "evaluation",
  ]),
  taskId: id,
  operationKey: id.nullable().default(null),
  runId: id.nullable(),
  changeRequestId: id.nullable(),
  parentAttemptId: id.nullable(),
  attemptNumber: z.number().int().min(1).max(1000),
  workflowKey: id.nullable(),
  workflowStepKey: id.nullable(),
  agentProfileKey: id.nullable(),
  platformReleaseId: version,
  systemReleaseId: version,
  systemManifestHash: hash.nullable(),
  overlayReleaseId: version,
  overlayManifestHash: hash.nullable(),
  modelCatalogRevision: version,
  routerPolicyVersion: version,
  routingDecisionId: version,
  adapterVersion: id,
});

/** Тариф immutable. Auth mode предотвращает неявную оценку подписки по API price. */
export const usagePriceSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    pricingId: id,
    installationId: id,
    revision: z.number().int().min(1).max(1000000),
    basis,
    provider: id,
    model: id,
    authMode: id,
    currency: usageCurrencySchema,
    method: z.enum([
      "api_tariff",
      "contract_tariff",
      "subscription_allocation",
      "infrastructure_allocation",
      "customer_tariff",
    ]),
    unit: z.enum(["million_tokens", "second"]),
    rates: z.strictObject({
      inputNanos: usageNanosSchema.nullable(),
      cachedInputNanos: usageNanosSchema.nullable(),
      outputNanos: usageNanosSchema.nullable(),
      secondNanos: usageNanosSchema.nullable(),
    }),
    effectiveFrom: timestamp,
    observedAt: timestamp,
    sourceRef,
    contentHash: hash,
  })
  .superRefine((value, context) => {
    if (
      (value.basis === "infrastructure" &&
        value.method !== "infrastructure_allocation") ||
      (value.basis === "provider" &&
        !["api_tariff", "contract_tariff", "subscription_allocation"].includes(
          value.method,
        ))
    )
      context.addIssue({
        code: "custom",
        message: "Price method does not match its basis.",
      });
    const tokenPrice = value.unit === "million_tokens";
    if (
      tokenPrice
        ? [
            value.rates.inputNanos,
            value.rates.cachedInputNanos,
            value.rates.outputNanos,
          ].some((x) => x === null) || value.rates.secondNanos !== null
        : value.rates.secondNanos === null ||
          [
            value.rates.inputNanos,
            value.rates.cachedInputNanos,
            value.rates.outputNanos,
          ].some((x) => x !== null)
    )
      context.addIssue({
        code: "custom",
        message: "Price rates must match their unit.",
      });
    if (
      (value.basis === "infrastructure") !== (value.unit === "second") ||
      (value.basis === "customer" && value.method !== "customer_tariff")
    )
      context.addIssue({
        code: "custom",
        message: "Price method/unit does not match its basis.",
      });
  });

export const usageObservationSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  eventId: id,
  attemptId: id,
  sequence: z.number().int().min(1).max(1000000),
  observedAt: timestamp,
  outcome: z.enum(["running", "completed", "failed", "cancelled"]),
  model: id.nullable(),
  tokens: usageTokensSchema,
  durationMs: count,
  toolDurationMs: count,
  coverage: z.enum(["unknown", "partial", "turn"]),
  providerEvidence: z
    .strictObject({
      threadId: id,
      turnId: id,
      measurementId: id,
    })
    .nullable(),
});

export const usageBudgetPolicySchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    installationId: id,
    projectId: id,
    purpose: purpose,
    basis: z.enum(["provider", "customer"]),
    currency: usageCurrencySchema,
    revision: z.number().int().min(1).max(1000000),
    mode: z.enum(["soft", "hard"]),
    limitNanos: usageNanosSchema.nullable(),
    reservationNanos: usageNanosSchema.refine(
      (value) => BigInt(value) > BigInt(0),
    ),
  })
  .refine(
    (value) =>
      value.basis !== "customer" || value.purpose === "customer_runtime",
    "Customer budgets cannot cover internal usage.",
  );

export const usageReconciliationSchema = z.strictObject({
  eventId: id,
  attemptId: id,
  expectedRevision: z.number().int().min(0),
  basis,
  amountNanos: usageNanosSchema,
  currency: usageCurrencySchema,
  evidenceRef: sourceRef,
  observedAt: timestamp,
});

/** Явное административное подтверждение остановленного runtime; сам резерв не освобождает. */
export const usageAbandonSchema = z.strictObject({
  eventId: id,
  attemptId: id,
  expectedRevision: z.number().int().min(0),
  runtimeStopped: z.literal(true),
  evidenceRef: sourceRef,
  observedAt: timestamp,
});

export const usageQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(366).default(30),
  installationId: id.optional(),
  projectId: id.optional(),
  purpose: purpose.optional(),
  model: z
    .union([
      id,
      z.literal(usageGroupKeys.unassigned),
      z.literal(usageGroupKeys.noModel),
    ])
    .optional(),
  systemReleaseId: id.optional(),
  overlayReleaseId: id.optional(),
  modelCatalogRevision: id.optional(),
  routerPolicyVersion: id.optional(),
  source: z
    .enum([
      "chat",
      "workflow",
      "execution",
      "review",
      "build",
      "preview",
      "development",
      "evaluation",
    ])
    .optional(),
  workflowKey: z.union([id, z.literal(usageGroupKeys.unassigned)]).optional(),
  agentProfileKey: z
    .union([id, z.literal(usageGroupKeys.unassigned)])
    .optional(),
  outcome: z.enum(["running", "completed", "failed", "cancelled"]).optional(),
  before: z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .optional(),
});
