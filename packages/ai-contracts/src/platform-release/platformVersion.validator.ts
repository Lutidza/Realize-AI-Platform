/**
 * @file packages/ai-contracts/src/platform-release/platformVersion.validator.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет точные версии и идентификаторы артефактов платформы.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { z } from "zod";

/** SemVer 2.0.0 без диапазонов; равенство полных строк не выводит совместимость. */
export const exactVersionSchema = z
  .string()
  .max(128)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  );

export const releaseHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const releaseCommitSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const releaseDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const releaseIdSchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9@][A-Za-z0-9@/._:-]*$/);
export const releaseTimestampSchema = z.string().refine((value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}, "Expected a canonical UTC timestamp");

/** Только относительный путь Git source tree; не путь к secrets или filesystem API. */
export const releaseSourcePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !/[\\\x00-\x1f:]/.test(value) &&
      value
        .split("/")
        .every((part) => part !== "" && part !== "." && part !== ".."),
    "Expected a relative source path without traversal",
  );

export const releaseComponentKindSchema = z.enum([
  "core-package",
  "profile",
  "api-contract",
  "data-schema",
  "system-ai",
  "admin-ai-schema",
  "compiler",
  "development-instructions",
  "quality-pack",
  "ci-policy",
  "provider-adapter",
  "model-catalog",
  "routing-policy",
  "pricing",
]);

export const releasePinSchema = z.strictObject({
  id: releaseIdSchema,
  version: exactVersionSchema,
  sha256: releaseHashSchema,
});

/** Публичный срок поддержки задаётся явно; development не обещает поддержку клиентов. */
export const releaseSupportSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("development") }),
  z.strictObject({
    status: z.literal("supported"),
    endsAt: releaseTimestampSchema,
  }),
  z
    .strictObject({
      status: z.literal("deprecated"),
      announcedAt: releaseTimestampSchema,
      endsAt: releaseTimestampSchema,
      replacementVersion: exactVersionSchema,
      reason: z.string().min(1).max(2000),
      migrationGuide: z.url().refine((value) => value.startsWith("https://")),
    })
    .refine(
      (value) => value.announcedAt < value.endsAt,
      "Invalid deprecation window",
    ),
]);
