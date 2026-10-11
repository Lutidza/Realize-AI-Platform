/**
 * @file packages/ai-contracts/src/evaluation/evaluation.schemas.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет ограниченные результаты evals, provenance и review без клиентских данных.
 */
import { z } from "zod";
import { usageTokensSchema } from "../usage/usageLedger.schemas";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const filePath = z
  .string()
  .max(240)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+$/);
const files = z
  .record(filePath, hash)
  .refine((value) => Object.keys(value).length <= 40);
const money = z
  .strictObject({
    state: z.enum(["unknown", "estimated", "reconciled"]),
    amountNanos: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,20})$/)
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    pricingId: id.nullable(),
    evidenceRef: z.string().max(512).nullable(),
  })
  .refine((value) =>
    value.state === "unknown"
      ? value.amountNanos === null && value.currency === null
      : value.amountNanos !== null && value.currency !== null,
  );
export const evaluationCaseIdSchema = z.enum([
  "scoped-edit",
  "overlay-escalation",
  "read-recovery",
]);
export const evaluationCandidateSchema = z.strictObject({
  systemReleaseId: id,
  systemManifestHash: hash,
  developmentSourceHash: hash,
  runtimeHash: hash,
  harnessHash: hash,
  adapterVersion: id,
  model: id,
  authMode: id,
  platformReleaseId: id.nullable(),
  modelCatalogRevision: id.nullable(),
  routerPolicyVersion: id.nullable(),
});
export const evaluationCaseSchema = z.strictObject({
  scenarioId: evaluationCaseIdSchema,
  repeat: z.number().int().min(0).max(1),
  runId: z.uuid(),
  attemptId: z.uuid().nullable(),
  instructionsHash: hash,
  overlayReleaseId: id.nullable(),
  overlayManifestHash: hash.nullable(),
  startedAt: z.iso.datetime(),
  durationMs: count,
  outcome: z.enum(["completed", "failed", "cancelled", "not_started"]),
  stopReason: z.enum([
    "none",
    "timeout",
    "token_limit",
    "output_limit",
    "tool_limit",
    "ledger_failure",
    "provider_failure",
    "suite_budget",
    "admission_failed",
  ]),
  before: files,
  after: files,
  sourceCalls: z
    .array(
      z.strictObject({
        status: z.enum(["unavailable", "returned", "rejected"]),
        contentHash: hash.nullable(),
      }),
    )
    .max(16),
  tools: z
    .array(
      z.strictObject({
        phase: z.enum(["started", "completed", "failed"]),
        summary: z.string().max(1000),
      }),
    )
    .max(64),
  output: z.string().max(32_768),
  usage: z
    .strictObject({
      coverage: z.enum(["unknown", "partial", "turn"]),
      tokens: usageTokensSchema,
      model: id.nullable(),
      costs: z.strictObject({
        provider: money,
        infrastructure: money,
        customer: money,
      }),
    })
    .nullable(),
});
export const evaluationReportSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  runId: z.uuid(),
  createdAt: z.iso.datetime(),
  suite: z.strictObject({
    id: z.literal("realize-agent-core"),
    version: z.literal("1.0.0"),
    corpusHash: hash,
    rubricVersion: z.literal("1.0.0"),
    repeats: z.literal(2),
  }),
  candidate: evaluationCandidateSchema,
  environment: z.strictObject({
    platform: id,
    architecture: id,
    nodeVersion: id,
    codexVersion: z.string().min(1).max(128),
  }),
  budget: z.strictObject({
    maxTurns: z.literal(6),
    maxDurationMs: z.literal(600_000),
    turnTimeoutMs: z.literal(120_000),
    maxObservedTokens: z.number().int().min(1000).max(300_000),
    unknownCost: z.enum(["subscription_bounded", "deny"]),
  }),
  elapsedMs: count,
  termination: z.enum(["completed", "budget", "failure"]),
  cases: z.array(evaluationCaseSchema).max(6),
});
export const evaluationEnvelopeSchema = z.strictObject({
  report: evaluationReportSchema,
  contentHash: hash,
});
/** Review оценивает полезность/честность; обязательные нарушения пересчитываются отдельно. */
export const evaluationReviewSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  reportHash: hash,
  reviewer: id,
  reviewedAt: z.iso.datetime(),
  cases: z
    .array(
      z.strictObject({
        scenarioId: evaluationCaseIdSchema,
        repeat: z.number().int().min(0).max(1),
        useful: z.boolean(),
        honest: z.boolean(),
        notes: z.string().min(10).max(2000),
      }),
    )
    .length(6),
});
