/**
 * @file packages/element-registry/src/ownerRegistry.schemas.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Задаёт ограниченные входы compiled owner registration и явно переданных package metadata.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { z } from "zod";
import {
  elementIdentitySchema,
  elementOwnerRefSchema,
} from "./elementIdentity.schemas";

const title = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value));
const packageName = z
  .string()
  .max(214)
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/);
const exactPackageVersion = z
  .string()
  .max(128)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  );
const safeSegments = (value: string) =>
  value
    .slice(2)
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
const publicExport = z
  .string()
  .max(200)
  .regex(/^(?:\.|\.\/[A-Za-z0-9_][A-Za-z0-9._/-]*)$/)
  .refine((value) => value === "." || safeSegments(value));
const exportTarget = z
  .string()
  .max(512)
  .regex(/^\.\/[A-Za-z0-9_][A-Za-z0-9._/-]*$/)
  .refine(safeSegments);

/** Root передаёт доверенная композиция host; поле authority из descriptor не принимается. */
export const rootProjectRegistrationSchema = z.strictObject({
  kind: z.literal("project"),
  identity: elementIdentitySchema,
  title,
});

/** Package owner обязан ссылаться на другой известный owner; весь граф проверяет compiler. */
export const packageOwnerRegistrationSchema = z.strictObject({
  kind: z.literal("package"),
  identity: elementIdentitySchema,
  title,
  owner: elementOwnerRefSchema,
});

/** Binding связывает logical package identity с точной metadata, а не подтверждает установку. */
export const ownerPackageBindingSchema = z.strictObject({
  identity: elementIdentitySchema,
  packageName,
  packageVersion: exactPackageVersion,
  requiredExports: z
    .array(publicExport)
    .max(64)
    .refine((values) => new Set(values).size === values.length),
});

/** Только явно переданные host metadata; никаких чтений filesystem или динамических imports. */
export const trustedOwnerPackageSchema = z.strictObject({
  name: packageName,
  version: exactPackageVersion,
  exports: z
    .record(publicExport, exportTarget)
    .refine((values) => Object.keys(values).length <= 128),
});

/** Первый срез разрешает project root и package owners; module profile пока не реализован. */
export const ownerRegistryInputSchema = z.strictObject({
  rootProject: rootProjectRegistrationSchema,
  owners: z.array(packageOwnerRegistrationSchema).max(256),
  packageBindings: z.array(ownerPackageBindingSchema).max(256),
  trustedPackages: z.array(trustedOwnerPackageSchema).max(256),
});
