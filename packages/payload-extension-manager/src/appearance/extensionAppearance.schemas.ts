/**
 * @file packages/payload-extension-manager/src/appearance/extensionAppearance.schemas.ts
 * @version 1.2.0
 * @date 2026-11-18
 * @description Проверяет строгие команды и сериализуемые записи appearance lifecycle.
 * @see documentation/specifications/extension-management.md
 */
import { z } from "zod";
import {
  isTemplateSettings,
  layoutAssignmentBindingSchema,
  templateSelectionSchema,
} from "@realize/template-contracts";
import type { TemplateSettings } from "@realize/template-contracts";
import { extensionTemplateReadinessSchema } from "../catalog/templateReadiness.schemas";
import { EXTENSION_APPEARANCE_LIMITS } from "./extensionAppearance.constants";

export const extensionHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const extensionActorKeySchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9:_-]+$/);
/** Lowercase UUID исключает разные ledger keys для одного case-insensitive UUID. */
export const extensionRequestIdSchema = z
  .uuid()
  .refine((value) => value === value.toLowerCase());
export const extensionSettingsSchema =
  z.custom<TemplateSettings>(isTemplateSettings);
const revisionSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const targetSchema = z.enum(["admin", "frontend"]);
const timeSchema = z.iso.datetime();

/** Только reader: отсутствие binding сохраняется буквально; разрешение каталога выполняется отдельно. */
export const extensionAssignmentSchema = z
  .strictObject({
    selection: templateSelectionSchema,
    settings: extensionSettingsSchema,
    manifestHash: extensionHashSchema,
    layout: layoutAssignmentBindingSchema.optional(),
  })
  .superRefine((assignment, context) => {
    if (Object.hasOwn(assignment, "layout") && assignment.layout === undefined)
      context.addIssue({
        code: "custom",
        path: ["layout"],
        message: "Omit an absent layout binding",
      });
    // Zod может продолжить refinement после custom issue у settings; не читаем невалидный объект.
    if (
      !assignment.layout ||
      !isTemplateSettings(assignment.settings) ||
      !Object.hasOwn(assignment.settings, "layoutId")
    )
      return;
    if (assignment.settings.layoutId !== assignment.layout.localId)
      context.addIssue({
        code: "custom",
        path: ["settings", "layoutId"],
        message: "Explicit layout alias does not match binding",
      });
  });
export const extensionTargetStateSchema = z.strictObject({
  revision: revisionSchema,
  current: extensionAssignmentSchema.nullable(),
  previous: extensionAssignmentSchema.nullable(),
});
export const prepareExtensionAppearanceSchema = z
  .discriminatedUnion("action", [
    z.strictObject({
      action: z.literal("assign"),
      target: targetSchema,
      expectedRevision: revisionSchema,
      expectedCatalogHash: extensionHashSchema,
      selection: templateSelectionSchema,
      settings: extensionSettingsSchema,
    }),
    z.strictObject({
      action: z.literal("recover"),
      target: targetSchema,
      expectedRevision: revisionSchema,
      expectedCatalogHash: extensionHashSchema,
    }),
  ])
  .refine(
    (input) =>
      input.action === "recover" || input.selection.target === input.target,
    { message: "Selection target mismatch" },
  );
export const applyExtensionAppearanceSchema = z.strictObject({
  planId: extensionRequestIdSchema,
  expectedPlanHash: extensionHashSchema,
});

/** DTO success проверяется до признания операции завершённой и освобождения request UUID. */
export const extensionAppearancePlanDtoSchema = z
  .strictObject({
    readiness: extensionTemplateReadinessSchema.optional(),
    planId: extensionRequestIdSchema,
    planHash: extensionHashSchema,
    action: z.enum(["assign", "recover"]),
    target: targetSchema,
    expectedRevision: revisionSchema,
    catalogHash: extensionHashSchema,
    current: extensionAssignmentSchema.nullable(),
    desiredAssignment: extensionAssignmentSchema,
    createdAt: timeSchema,
    expiresAt: timeSchema,
  })
  .refine(
    (plan) =>
      plan.desiredAssignment.selection.target === plan.target &&
      (plan.current === null ||
        plan.current.selection.target === plan.target) &&
      Date.parse(plan.expiresAt) > Date.parse(plan.createdAt),
    { message: "Plan DTO target or expiry mismatch" },
  );

export const extensionAppearanceReceiptDtoSchema = z
  .strictObject({
    planId: extensionRequestIdSchema,
    target: targetSchema,
    appliedRevision: revisionSchema.min(1),
    assignment: extensionAssignmentSchema,
    appliedAt: timeSchema,
  })
  .refine((receipt) => receipt.assignment.selection.target === receipt.target, {
    message: "Receipt DTO target mismatch",
  });

export const extensionAppearancePlanSchema = z
  .strictObject({
    id: extensionRequestIdSchema,
    hash: extensionHashSchema,
    actorKey: extensionActorKeySchema,
    requestId: extensionRequestIdSchema,
    inputFingerprint: extensionHashSchema,
    action: z.enum(["assign", "recover"]),
    target: targetSchema,
    expectedRevision: revisionSchema,
    stateHash: extensionHashSchema,
    catalogHash: extensionHashSchema,
    desiredAssignment: extensionAssignmentSchema,
    createdAt: timeSchema,
    expiresAt: timeSchema,
  })
  .refine(
    (plan) =>
      plan.desiredAssignment.selection.target === plan.target &&
      Date.parse(plan.expiresAt) > Date.parse(plan.createdAt),
    { message: "Plan target or expiry mismatch" },
  );

export const extensionAppearanceReceiptSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("prepare"),
      actorKey: extensionActorKeySchema,
      requestId: extensionRequestIdSchema,
      inputFingerprint: extensionHashSchema,
      plan: extensionAppearancePlanSchema,
      current: extensionAssignmentSchema.nullable(),
    }),
    z.strictObject({
      kind: z.literal("apply"),
      actorKey: extensionActorKeySchema,
      requestId: extensionRequestIdSchema,
      inputFingerprint: extensionHashSchema,
      planId: extensionRequestIdSchema,
      target: targetSchema,
      appliedRevision: revisionSchema.min(1),
      assignment: extensionAssignmentSchema,
      appliedAt: timeSchema,
    }),
  ])
  .refine(
    (receipt) =>
      receipt.kind === "prepare"
        ? receipt.actorKey === receipt.plan.actorKey &&
          receipt.requestId === receipt.plan.requestId &&
          receipt.inputFingerprint === receipt.plan.inputFingerprint &&
          (receipt.current === null ||
            receipt.current.selection.target === receipt.plan.target)
        : receipt.assignment.selection.target === receipt.target,
    { message: "Receipt identity mismatch" },
  );

export const extensionAppearanceStoreSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    targets: z.strictObject({
      admin: extensionTargetStateSchema,
      frontend: extensionTargetStateSchema,
    }),
    plans: z
      .array(extensionAppearancePlanSchema)
      .max(EXTENSION_APPEARANCE_LIMITS.plans),
    receipts: z
      .array(extensionAppearanceReceiptSchema)
      .max(EXTENSION_APPEARANCE_LIMITS.receipts),
  })
  .superRefine((store, context) => {
    for (const target of ["admin", "frontend"] as const) {
      const state = store.targets[target];
      if (
        [state.current, state.previous].some(
          (assignment) =>
            assignment !== null && assignment.selection.target !== target,
        )
      )
        context.addIssue({
          code: "custom",
          path: ["targets", target],
          message: "Assignment target mismatch",
        });
    }
    if (new Set(store.plans.map((plan) => plan.id)).size !== store.plans.length)
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "Duplicate plan ID",
      });
    const planKeys = store.plans.map((plan) =>
      JSON.stringify([plan.actorKey, plan.requestId]),
    );
    if (new Set(planKeys).size !== planKeys.length)
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "Duplicate pending request key",
      });
    const planHashes = new Map<string, string>();
    for (const plan of [
      ...store.plans,
      ...store.receipts.flatMap((receipt) =>
        receipt.kind === "prepare" ? [receipt.plan] : [],
      ),
    ]) {
      const previousHash = planHashes.get(plan.id);
      if (previousHash !== undefined && previousHash !== plan.hash)
        context.addIssue({
          code: "custom",
          path: ["plans"],
          message: "Conflicting immutable plan identity",
        });
      planHashes.set(plan.id, plan.hash);
    }
    const keys = store.receipts.map((receipt) =>
      JSON.stringify([receipt.kind, receipt.actorKey, receipt.requestId]),
    );
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: "custom",
        path: ["receipts"],
        message: "Duplicate receipt key",
      });
  });
