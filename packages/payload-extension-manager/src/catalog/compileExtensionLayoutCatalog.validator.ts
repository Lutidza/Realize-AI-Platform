/**
 * @file packages/payload-extension-manager/src/catalog/compileExtensionLayoutCatalog.validator.ts
 * @version 1.0.0
 * @date 2026-11-18
 * @description Компилирует trusted layout registration с проверкой hash и явного mapping точного выпуска.
 * @see documentation/specifications/extension-management.md
 */
import { z } from "zod";
import {
  layoutVersionedRefSchema,
  type TemplateLayoutCatalog,
  type TemplateManifest,
} from "@realize/template-contracts";
import { createTemplateLayoutCatalog } from "@realize/template-contracts/layouts/server";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import { assertExtensionLayoutCatalogScope } from "./assertExtensionLayoutCatalogScope.validator";

const registrationSchema = z.strictObject({
  templateIdentity: layoutVersionedRefSchema.shape.identity,
  catalog: z.unknown(),
});

/** Неполная заявленная поддержка не превращается в legacy; supplied catalogHash проверяется сервером. */
export function compileExtensionLayoutCatalog(
  value: unknown,
  manifest: TemplateManifest,
): TemplateLayoutCatalog | undefined {
  if (value === undefined) return undefined;
  const registration = registrationSchema.parse(value);
  const catalog = createTemplateLayoutCatalog(registration.catalog);
  if (
    catalog.template.identity.namespace !==
      registration.templateIdentity.namespace ||
    catalog.template.identity.id !== registration.templateIdentity.id
  )
    throw new ExtensionManagerError("INVALID_CATALOG");
  assertExtensionLayoutCatalogScope(catalog, manifest);
  return catalog;
}
