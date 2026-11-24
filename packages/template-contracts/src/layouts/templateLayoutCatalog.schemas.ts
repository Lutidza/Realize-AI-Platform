/**
 * @file packages/template-contracts/src/layouts/templateLayoutCatalog.schemas.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Проверяет shape release-каталога с точными alias pins без compiled renderers.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { z } from "zod";
import {
  layoutDescriptorSchema,
  layoutVersionedRefSchema,
} from "./layoutDescriptor.schemas";

/** Native local alias не меняет глобальную identity определения макета. */
export const templateLayoutLocalIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

/** Alias закрепляет exact definition version; ranges и выбор latest не поддерживаются. */
export const templateLayoutAliasSchema = z.strictObject({
  localId: templateLayoutLocalIdSchema,
  layout: layoutVersionedRefSchema,
});

const fields = {
  template: layoutVersionedRefSchema,
  defaultLayoutId: templateLayoutLocalIdSchema,
  aliases: z.array(templateLayoutAliasSchema).min(1).max(64),
  descriptors: z.array(layoutDescriptorSchema).min(1).max(32),
};

/** Shape authored metadata; cross-reference инварианты проверяет parseTemplateLayoutCatalog. */
export const templateLayoutCatalogInputSchema = z.strictObject(fields);

/** Browser проверяет формат hash; подлинность значения подтверждает только серверный builder. */
export const templateLayoutCatalogSchema = z.strictObject({
  ...fields,
  catalogHash: z.string().regex(/^[a-f0-9]{64}$/),
});
