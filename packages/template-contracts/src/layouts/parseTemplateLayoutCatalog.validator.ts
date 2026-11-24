/**
 * @file packages/template-contracts/src/layouts/parseTemplateLayoutCatalog.validator.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Проверяет весь граф exact alias references и template scope каталога макетов.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { getElementIdentityKey } from "@realize/element-registry";
import type { ParsedTemplateLayoutCatalog } from "./LayoutDescriptor.types";
import {
  templateLayoutCatalogInputSchema,
  templateLayoutCatalogSchema,
} from "./templateLayoutCatalog.schemas";
import { parseLayoutValue } from "./parseLayoutValue.validator";
import { getLayoutReferenceKey } from "./getLayoutReferenceKey.util";
import { freezeLayoutValue } from "./freezeLayoutValue.util";
import { LayoutContractError } from "./LayoutContract.error";

const compareKeys = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** SHA-256 в DTO проверяется по формату; browser caller использует доверенный server/build snapshot. */
export function parseTemplateLayoutCatalog(
  value: unknown,
): ParsedTemplateLayoutCatalog {
  const hasHash =
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "catalogHash");
  const catalog = hasHash
    ? parseLayoutValue(templateLayoutCatalogSchema, value, "INVALID_CATALOG")
    : parseLayoutValue(
        templateLayoutCatalogInputSchema,
        value,
        "INVALID_CATALOG",
      );
  const templateKey = getElementIdentityKey(catalog.template.identity);
  const descriptors = new Map<string, (typeof catalog.descriptors)[number]>();
  for (const [index, descriptor] of catalog.descriptors.entries()) {
    const key = getLayoutReferenceKey(descriptor);
    if (descriptors.has(key))
      throw new LayoutContractError(
        "DUPLICATE_DESCRIPTOR",
        `/descriptors/${index}/identity`,
      );
    if (getElementIdentityKey(descriptor.template) !== templateKey)
      throw new LayoutContractError(
        "TEMPLATE_MISMATCH",
        `/descriptors/${index}/template`,
      );
    descriptors.set(key, descriptor);
  }
  const aliases = new Set<string>();
  const referenced = new Set<string>();
  for (const [index, alias] of catalog.aliases.entries()) {
    if (aliases.has(alias.localId))
      throw new LayoutContractError(
        "DUPLICATE_ALIAS",
        `/aliases/${index}/localId`,
      );
    aliases.add(alias.localId);
    const key = getLayoutReferenceKey(alias.layout);
    if (!descriptors.has(key))
      throw new LayoutContractError(
        "UNKNOWN_LAYOUT_REFERENCE",
        `/aliases/${index}/layout`,
      );
    referenced.add(key);
  }
  if (!aliases.has(catalog.defaultLayoutId))
    throw new LayoutContractError("UNKNOWN_DEFAULT_LAYOUT", "/defaultLayoutId");
  for (const [index, descriptor] of catalog.descriptors.entries()) {
    if (!referenced.has(getLayoutReferenceKey(descriptor)))
      throw new LayoutContractError(
        "UNREFERENCED_DESCRIPTOR",
        `/descriptors/${index}`,
      );
  }
  // Порядок aliases/definitions не влияет на lookup. Порядок regions/slots/guides остаётся authored contract data.
  return freezeLayoutValue({
    ...catalog,
    aliases: [...catalog.aliases].sort((left, right) =>
      compareKeys(left.localId, right.localId),
    ),
    descriptors: [...catalog.descriptors].sort((left, right) =>
      compareKeys(getLayoutReferenceKey(left), getLayoutReferenceKey(right)),
    ),
  });
}
