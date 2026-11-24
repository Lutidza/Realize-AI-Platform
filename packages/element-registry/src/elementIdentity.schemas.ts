/**
 * @file packages/element-registry/src/elementIdentity.schemas.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Проверяет непреобразуемые identity tokens и ссылки на логических владельцев.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { z } from "zod";

const token = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Namespace сравнивается буквально; валидатор не предоставляет право публикации в нём. */
export const elementNamespaceSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(token)
  .brand<"ElementNamespace">();

/** Local ID сохраняет регистр legacy tokens и не является путём или именем package. */
export const elementIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(token)
  .brand<"ElementId">();

/** Идентичность — строгая пара полей; её нельзя склеивать через разделитель из token grammar. */
export const elementIdentitySchema = z.strictObject({
  namespace: elementNamespaceSchema,
  id: elementIdSchema,
});

/** Kind и версия владельца разрешаются по snapshot и не дублируются в ссылке. */
export const elementOwnerRefSchema = z.strictObject({
  identity: elementIdentitySchema,
});
