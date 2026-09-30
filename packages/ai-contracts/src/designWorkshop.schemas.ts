/**
 * @file packages/ai-contracts/src/designWorkshop.schemas.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Проверяет bounded commands и логические текстовые пути без выдачи прав на исполнение.
 * @see documentation/specifications/design-workshop.md
 */
import { z } from "zod";
import { DESIGN_WORKSHOP_LIMITS as limits } from "./designWorkshop.constants";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => !s.includes("\0") && s.isWellFormed());
const notes = z.array(text(1000).min(1)).max(24);
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;

/** Только виртуальные файлы; policy не подтверждает безопасность TSX/HTML/SVG исполнения. */
export const designFilePathSchema = z
  .string()
  .max(256)
  .refine((path) => {
    if (
      !/^(src|public)\/[A-Za-z0-9_/-][A-Za-z0-9_./-]*\.(tsx?|jsx?|css|html|json|svg|md)$/.test(
        path,
      )
    )
      return false;
    const parts = path.split("/");
    const denied = new Set([
      "node_modules",
      "dist",
      "build",
      "coverage",
      "generated",
      "migrations",
      "secrets",
      "credentials",
      "vendor",
      "__generated__",
    ]);
    return parts.every(
      (part) =>
        /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) &&
        !denied.has(part.toLowerCase()) &&
        !/^(?:agents\.md|package(?:-lock)?\.json|tsconfig(?:\..+)?\.json|next-env\.d\.ts|payload-types\.ts|importmap\.js|(?:secrets?|credentials?|private[-_]?key)\..+)$/i.test(
          part,
        ) &&
        !/\.config\./i.test(part),
    );
  }, "Недопустимый путь текстового макета.");

export const designBriefSchema = z.strictObject({
  goal: text(4000).trim().min(1),
  audience: text(2000).trim().min(1),
  screens: notes,
  states: notes,
  constraints: notes,
  acceptanceCriteria: notes.min(1),
});
export const designSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("link"),
    title: text(200).trim().min(1),
    url: z
      .url({ protocol: /^https?$/ })
      .max(2048)
      .refine((url) => {
        const parsed = new URL(url);
        return !parsed.username && !parsed.password;
      }),
  }),
  z.strictObject({
    kind: z.literal("note"),
    title: text(200).trim().min(1),
    text: text(8000).min(1),
  }),
]);
export const designFileSchema = z.strictObject({
  path: designFilePathSchema,
  content: text(limits.fileBytes).refine((s) => bytes(s) <= limits.fileBytes),
});
export const designSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    brief: designBriefSchema,
    sources: z.array(designSourceSchema).max(16),
    files: z.array(designFileSchema).max(limits.files),
  })
  .superRefine((snapshot, ctx) => {
    const paths = snapshot.files.map((file) => file.path.toLowerCase());
    if (new Set(paths).size !== paths.length)
      ctx.addIssue({
        code: "custom",
        message: "Пути файлов должны быть уникальны.",
      });
    if (
      paths.some((path) => paths.some((other) => other.startsWith(`${path}/`)))
    )
      ctx.addIssue({
        code: "custom",
        message: "Файл не может одновременно быть каталогом.",
      });
    if (
      snapshot.files.reduce((sum, file) => sum + bytes(file.content), 0) >
      limits.snapshotFileBytes
    )
      ctx.addIssue({
        code: "custom",
        message: "Превышен объём файлов макета.",
      });
  });
const operations = z
  .array(
    z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("put"), ...designFileSchema.shape }),
      z.strictObject({ kind: z.literal("delete"), path: designFilePathSchema }),
    ]),
  )
  .max(limits.files)
  .refine(
    (items) =>
      new Set(items.map((item) => item.path.toLowerCase())).size ===
      items.length,
  );

export const designWorkshopCommands = {
  create: z.strictObject({
    title: text(160).trim().min(1),
    target: z.enum(["admin", "frontend", "shared"]),
    kind: z.enum(["reference", "interface", "component", "module", "theme"]),
    snapshot: designSnapshotSchema,
  }),
  prepare: z.strictObject({
    baseRevisionId: z.uuid(),
    summary: text(1000).trim().min(1),
    brief: designBriefSchema.optional(),
    sources: z.array(designSourceSchema).max(16).optional(),
    operations,
  }),
  apply: z.strictObject({}),
  list: z.strictObject({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(limits.pageSize)
      .default(limits.pageSize),
  }),
  identifier: z.uuid(),
};

/** Replay проходит схему заново: лишние внутренние поля не выходят из JSON ledger. */
export const designMutationReceiptSchema = z.strictObject({
  operationId: z.uuid(),
  action: z.enum(["create", "prepare", "apply"]),
  projectId: z.uuid(),
  revision: z.strictObject({
    revisionId: z.uuid(),
    number: z.number().int().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  changeId: z.uuid().nullable(),
});
