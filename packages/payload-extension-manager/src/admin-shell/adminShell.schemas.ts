/**
 * @file packages/payload-extension-manager/src/admin-shell/adminShell.schemas.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Проверяет строгие shell commands, immutable records и browser-safe DTO.
 * @see documentation/specifications/extension-management.md
 */
import { z } from "zod";
import { extensionTemplateReadinessSchema } from "../catalog/templateReadiness.schemas";
import {
  extensionActorKeySchema,
  extensionAssignmentSchema,
  extensionHashSchema,
  extensionRequestIdSchema,
} from "../appearance/extensionAppearance.schemas";
import { EXTENSION_APPEARANCE_LIMITS } from "../appearance/extensionAppearance.constants";
import type { AdminShellPlan } from "./AdminShell.types";

export const adminShellModeSchema = z.enum(["native", "template"]);
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const time = z.iso.datetime();
/** Только абсолютный внутренний path; host policy не принимает origin/query/fragment/traversal. */
const route = z
  .string()
  .min(1)
  .max(256)
  .regex(/^\/[A-Za-z0-9/_-]*$/)
  .refine(
    (value) => !value.includes("//") && (value === "/" || !value.endsWith("/")),
  );
export const adminShellPolicySchema = z
  .strictObject({
    enabled: z.strictObject({ native: z.boolean(), template: z.boolean() }),
    defaultMode: adminShellModeSchema,
    fallbackMode: adminShellModeSchema,
    nativeVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/),
    nativeRoute: route,
    templateRoute: route,
  })
  .refine(
    (policy) =>
      policy.enabled[policy.defaultMode] &&
      policy.enabled[policy.fallbackMode] &&
      policy.nativeRoute !== policy.templateRoute,
    { message: "Shell defaults or routes unavailable" },
  );
export const adminShellStateSchema = z.strictObject({
  revision,
  current: adminShellModeSchema,
  previous: adminShellModeSchema.nullable(),
});
export const adminShellTemplateBindingSchema = z
  .strictObject({
    appearanceRevision: revision,
    appearanceHash: extensionHashSchema,
    catalogHash: extensionHashSchema,
    assignment: extensionAssignmentSchema,
  })
  .refine((binding) => binding.assignment.selection.target === "admin", {
    message: "Admin assignment required",
  });
export const prepareAdminShellSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("select"),
    mode: adminShellModeSchema,
    expectedRevision: revision,
    expectedPolicyHash: extensionHashSchema,
  }),
  z.strictObject({
    action: z.literal("recover"),
    expectedRevision: revision,
    expectedPolicyHash: extensionHashSchema,
  }),
]);
export const applyAdminShellSchema = z.strictObject({
  planId: extensionRequestIdSchema,
  expectedPlanHash: extensionHashSchema,
});
const planFields = {
  action: z.enum(["select", "recover"]),
  currentMode: adminShellModeSchema,
  desiredMode: adminShellModeSchema,
  expectedRevision: revision,
  policyHash: extensionHashSchema,
  templateBinding: adminShellTemplateBindingSchema.nullable(),
  createdAt: time,
  expiresAt: time,
};
/** Native plan не содержит фиктивного SDK selection; template обязан иметь exact candidate. */
const coherentPlan = (
  plan: Pick<
    AdminShellPlan,
    "desiredMode" | "templateBinding" | "createdAt" | "expiresAt"
  >,
) =>
  (plan.desiredMode === "native"
    ? plan.templateBinding === null
    : plan.templateBinding !== null) &&
  Date.parse(plan.expiresAt) > Date.parse(plan.createdAt);
export const adminShellPlanSchema = z
  .strictObject({
    ...planFields,
    id: extensionRequestIdSchema,
    hash: extensionHashSchema,
    actorKey: extensionActorKeySchema,
    requestId: extensionRequestIdSchema,
    inputFingerprint: extensionHashSchema,
    stateHash: extensionHashSchema,
  })
  .refine(coherentPlan, { message: "Plan mode or expiry mismatch" });
export const adminShellPlanDtoSchema = z
  .strictObject({
    readiness: extensionTemplateReadinessSchema.optional(),
    ...planFields,
    planId: extensionRequestIdSchema,
    planHash: extensionHashSchema,
  })
  .refine(coherentPlan, { message: "Plan DTO mode or expiry mismatch" });
const receiptFields = {
  planId: extensionRequestIdSchema,
  appliedRevision: revision.min(1),
  mode: adminShellModeSchema,
  appliedAt: time,
};
export const adminShellReceiptDtoSchema = z.strictObject(receiptFields);
export const adminShellReceiptSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("prepare"),
      actorKey: extensionActorKeySchema,
      requestId: extensionRequestIdSchema,
      inputFingerprint: extensionHashSchema,
      plan: adminShellPlanSchema,
    }),
    z.strictObject({
      kind: z.literal("apply"),
      actorKey: extensionActorKeySchema,
      requestId: extensionRequestIdSchema,
      inputFingerprint: extensionHashSchema,
      ...receiptFields,
    }),
  ])
  .refine(
    (receipt) =>
      receipt.kind === "apply" ||
      (receipt.actorKey === receipt.plan.actorKey &&
        receipt.requestId === receipt.plan.requestId &&
        receipt.inputFingerprint === receipt.plan.inputFingerprint),
    { message: "Receipt identity mismatch" },
  );
export const adminShellStoreSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    domain: z.literal("admin-shell"),
    state: adminShellStateSchema,
    plans: z.array(adminShellPlanSchema).max(EXTENSION_APPEARANCE_LIMITS.plans),
    receipts: z
      .array(adminShellReceiptSchema)
      .max(EXTENSION_APPEARANCE_LIMITS.receipts),
  })
  .superRefine((store, context) => {
    const unique = (keys: string[]) => new Set(keys).size === keys.length;
    if (
      !unique(store.plans.map((plan) => plan.id)) ||
      !unique(
        store.plans.map((plan) =>
          JSON.stringify([plan.actorKey, plan.requestId]),
        ),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "Duplicate pending identity",
      });
    if (
      !unique(
        store.receipts.map((receipt) =>
          JSON.stringify([receipt.kind, receipt.actorKey, receipt.requestId]),
        ),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["receipts"],
        message: "Duplicate receipt identity",
      });
    const hashes = new Map<string, string>();
    for (const plan of [
      ...store.plans,
      ...store.receipts.flatMap((receipt) =>
        receipt.kind === "prepare" ? [receipt.plan] : [],
      ),
    ]) {
      const previousHash = hashes.get(plan.id);
      if (previousHash !== undefined && previousHash !== plan.hash)
        context.addIssue({
          code: "custom",
          path: ["plans"],
          message: "Conflicting immutable plan",
        });
      hashes.set(plan.id, plan.hash);
    }
  });
export const adminShellSnapshotSchema = z.strictObject({
  policy: adminShellPolicySchema,
  policyHash: extensionHashSchema,
  state: adminShellStateSchema,
  storage: z.enum(["ready", "requires_schema"]),
  history: z
    .array(adminShellReceiptDtoSchema)
    .max(EXTENSION_APPEARANCE_LIMITS.receipts),
  permissions: z.strictObject({ manageShell: z.boolean() }),
});
export const adminShellPrepareResponseSchema = z.strictObject({
  plan: adminShellPlanDtoSchema,
  replayed: z.boolean(),
});
export const adminShellApplyResponseSchema = z.strictObject({
  receipt: adminShellReceiptDtoSchema,
  replayed: z.boolean(),
});
