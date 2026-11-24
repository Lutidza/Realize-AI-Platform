/**
 * @file packages/payload-extension-manager/src/installed-templates/installedTemplates.schemas.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Проверяет строгий inventory DTO и runtime evidence без приватных полей и фиктивного native package.
 * @see documentation/specifications/extension-management.md
 */
import { z } from "zod";
import { extensionTemplateReadinessSchema } from "../catalog/templateReadiness.schemas";
import { templateSelectionSchema } from "@realize/template-contracts";
import { extensionHashSchema } from "../appearance/extensionAppearance.schemas";

const identifier = templateSelectionSchema.shape.templateId;
const version = templateSelectionSchema.shape.templateVersion;
const target = templateSelectionSchema.shape.target;
const mode = templateSelectionSchema.shape.mode;
const time = z.iso.datetime();
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
const targets = z.array(target).max(2).refine(unique);
const identityFields = {
  schemaVersion: z.literal("1.0"),
  buildId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
  sourceVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,159}$/),
  builtAt: time,
};
/** Формат receipt не доказывает его происхождение: filesystem/process identity проверяет host. */
export const installedTemplateRuntimeReceiptSchema =
  z.strictObject(identityFields);
export const installedTemplateRuntimeEvidenceSchema = z.strictObject({
  ...identityFields,
  catalogHash: extensionHashSchema,
});
export const installedTemplateRuntimeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("verified"),
    buildId: identityFields.buildId,
    sourceVersion: identityFields.sourceVersion,
    builtAt: time,
  }),
  z.strictObject({
    status: z.literal("unverified"),
    buildId: z.null(),
    sourceVersion: z.null(),
    builtAt: z.null(),
  }),
]);
const usage = z.strictObject({
  selectedTargets: targets,
  activeTargets: targets,
  defaultTargets: targets,
});
const actions = z.strictObject({
  settings: z.boolean(),
  select: z.boolean(),
  reason: z
    .enum([
      "read_only",
      "requires_schema",
      "runtime_unverified",
      "unavailable",
      "preview_only",
    ])
    .nullable(),
});
const common = {
  key: z.string().min(1).max(280),
  name: z.string().trim().min(1).max(160),
  targets: targets.min(1),
  installation: z.enum(["confirmed", "unverified"]),
  availability: z.enum(["available", "disabled", "incompatible"]),
  usage,
  actions,
};
export const installedTemplateEntrySchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...common,
      kind: z.literal("builtin"),
      id: z.literal("payload-native"),
      version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/),
      packageName: z.null(),
      palettes: z.tuple([]),
    }),
    z.strictObject({
      ...common,
      kind: z.literal("package"),
      readiness: extensionTemplateReadinessSchema.optional(),
      id: identifier,
      version,
      packageName: z
        .string()
        .max(214)
        .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/),
      palettes: z
        .array(
          z.strictObject({
            id: identifier,
            version,
            label: z.string().trim().min(1).max(160),
            modes: z.array(mode).min(1).max(2).refine(unique),
          }),
        )
        .min(1)
        .max(20)
        .refine((palettes) => unique(palettes.map((palette) => palette.id))),
    }),
  ])
  .refine(
    (entry) => {
      const previewOnly =
        entry.kind === "package" && entry.readiness === "preview-only";
      const allUsage = [
        ...entry.usage.selectedTargets,
        ...entry.usage.activeTargets,
        ...entry.usage.defaultTargets,
      ];
      return (
        entry.key === `${entry.kind}:${entry.id}@${entry.version}` &&
        allUsage.every((value) => entry.targets.includes(value)) &&
        (entry.kind !== "builtin" ||
          (entry.targets.length === 1 &&
            entry.targets[0] === "admin" &&
            !entry.actions.settings)) &&
        (entry.availability === "available" ||
          entry.usage.activeTargets.length === 0) &&
        (!previewOnly ||
          (!entry.actions.select && entry.usage.activeTargets.length === 0)) &&
        (entry.actions.reason !== "preview_only" || previewOnly) &&
        (entry.actions.select
          ? entry.actions.reason === null
          : entry.actions.settings
            ? entry.actions.reason === (previewOnly ? "preview_only" : null)
            : entry.actions.reason !== null) &&
        (!(entry.actions.settings || entry.actions.select) ||
          (entry.installation === "confirmed" &&
            entry.availability === "available"))
      );
    },
    { message: "Incoherent inventory entry" },
  );
export const installedTemplateUnavailableAssignmentSchema = z.strictObject({
  target,
  templateId: identifier,
  templateVersion: version,
  reason: z.enum(["not_compiled", "incompatible", "invalid_assignment"]),
});
/** Success DTO проверяется UI до показа подтверждённой установки или доступного действия. */
export const installedTemplatesSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    runtime: installedTemplateRuntimeSchema,
    entries: z.array(installedTemplateEntrySchema).max(101),
    unavailableAssignments: z
      .array(installedTemplateUnavailableAssignmentSchema)
      .max(2),
    storage: z.enum(["ready", "requires_schema"]),
    permissions: z.strictObject({ manageAppearance: z.boolean() }),
    observedAt: time,
  })
  .refine(
    (snapshot) =>
      unique(snapshot.entries.map((entry) => entry.key)) &&
      unique(
        snapshot.unavailableAssignments.map((assignment) => assignment.target),
      ) &&
      snapshot.entries.every(
        (entry) =>
          entry.installation ===
            (snapshot.runtime.status === "verified"
              ? "confirmed"
              : "unverified") &&
          (!(entry.actions.settings || entry.actions.select) ||
            (snapshot.storage === "ready" &&
              snapshot.permissions.manageAppearance)),
      ) &&
      (snapshot.runtime.builtAt === null ||
        Date.parse(snapshot.runtime.builtAt) <=
          Date.parse(snapshot.observedAt)),
    { message: "Incoherent installed templates snapshot" },
  );
