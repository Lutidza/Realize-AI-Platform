/**
 * @file packages/template-realizeai-control-panel/src/assertControlPanelLayoutBindings.validator.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Сверяет compiled Frame bindings с exact pins и областями metadata каталога.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import {
  LayoutContractError,
  layoutVersionedRefSchema,
  parseLayoutDescriptor,
  resolveTemplateLayout,
} from "@realize/template-contracts";
import type { ParsedTemplateLayoutCatalog } from "@realize/template-contracts";
import type { ControlPanelLayoutDefinition } from "./ControlPanelDefinition.types";
import { ControlPanelFrame } from "./layouts/ControlPanelFrame.component";

/** Этот profile использует один тип Frame, чтобы смена варианта сохраняла content subtree. */
export function assertControlPanelLayoutBindings(
  catalog: ParsedTemplateLayoutCatalog,
  bindings: readonly ControlPanelLayoutDefinition[],
): void {
  if (
    bindings.length !== catalog.aliases.length ||
    new Set(bindings.map((binding) => binding.id)).size !== bindings.length
  )
    throw new LayoutContractError("INVALID_CATALOG", "/bindings");
  for (const [index, binding] of bindings.entries()) {
    const resolved = resolveTemplateLayout(catalog, binding.id);
    const parsedReference = layoutVersionedRefSchema.safeParse(
      binding.reference,
    );
    if (!parsedReference.success)
      throw new LayoutContractError(
        "UNKNOWN_LAYOUT_REFERENCE",
        `/bindings/${index}/reference`,
      );
    const reference = parsedReference.data;
    const descriptor = parseLayoutDescriptor(binding.descriptor);
    if (
      reference.identity.namespace !== resolved.reference.identity.namespace ||
      reference.identity.id !== resolved.reference.identity.id ||
      reference.version !== resolved.reference.version ||
      JSON.stringify(descriptor) !== JSON.stringify(resolved.descriptor)
    )
      throw new LayoutContractError(
        "UNKNOWN_LAYOUT_REFERENCE",
        `/bindings/${index}/reference`,
      );
    const hasTopbar = resolved.descriptor.regions.some(
      (region) => region.key === "topbar",
    );
    if (
      binding.Component !== ControlPanelFrame ||
      binding.frameProps.layoutId !== binding.id ||
      binding.frameProps.hasTopbar !== hasTopbar ||
      binding.target !== resolved.descriptor.target ||
      binding.screen !== resolved.descriptor.screen
    )
      throw new LayoutContractError("INVALID_CATALOG", `/bindings/${index}`);
  }
}
