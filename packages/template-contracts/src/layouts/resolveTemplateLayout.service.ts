/**
 * @file packages/template-contracts/src/layouts/resolveTemplateLayout.service.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Разрешает native local alias в exact layout definition без fallback для неизвестного значения.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { ResolvedTemplateLayout } from "./LayoutDescriptor.types";
import { parseTemplateLayoutCatalog } from "./parseTemplateLayoutCatalog.validator";
import { templateLayoutLocalIdSchema } from "./templateLayoutCatalog.schemas";
import { getLayoutReferenceKey } from "./getLayoutReferenceKey.util";
import { freezeLayoutValue } from "./freezeLayoutValue.util";
import { LayoutContractError } from "./LayoutContract.error";

/** Отсутствие alias наследует default только в результате lookup; исходные settings не изменяются. */
export function resolveTemplateLayout(
  value: unknown,
  layoutId?: string,
): ResolvedTemplateLayout {
  const catalog = parseTemplateLayoutCatalog(value);
  const localId = layoutId === undefined ? catalog.defaultLayoutId : layoutId;
  if (!templateLayoutLocalIdSchema.safeParse(localId).success)
    throw new LayoutContractError("UNKNOWN_LAYOUT", "/layoutId");
  const alias = catalog.aliases.find(
    (candidate) => candidate.localId === localId,
  );
  if (!alias) throw new LayoutContractError("UNKNOWN_LAYOUT", "/layoutId");
  const descriptor = catalog.descriptors.find(
    (candidate) =>
      getLayoutReferenceKey(candidate) === getLayoutReferenceKey(alias.layout),
  );
  if (!descriptor)
    throw new LayoutContractError("UNKNOWN_LAYOUT_REFERENCE", "/aliases");
  return freezeLayoutValue({ localId, descriptor, reference: alias.layout });
}
