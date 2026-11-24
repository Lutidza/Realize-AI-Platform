/**
 * @file src/registry/realizeTemplateLayoutCatalog.config.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Строит отдельный hash-bound каталог layout definitions текущего host без активации шаблона.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { createTemplateLayoutCatalog } from "@realize/template-contracts/layouts/server";
import { controlPanelLayoutCatalog } from "@realize/template-realizeai-control-panel/layouts";
import { resolveElementOwner } from "@realize/element-registry/server";
import { realizeOwnerRegistry } from "./realizeOwnerRegistry.config";

// Декларации не назначают владельца сами: host сверяет его с выбранным package binding.
for (const descriptor of controlPanelLayoutCatalog.descriptors) {
  const owner = resolveElementOwner(realizeOwnerRegistry, descriptor.owner);
  const binding = realizeOwnerRegistry.packageBindings.find(
    (item) =>
      item.identity.namespace === owner.identity.namespace &&
      item.identity.id === owner.identity.id,
  );
  if (
    owner.kind !== "package" ||
    binding?.packageName !== "@realize/template-realizeai-control-panel"
  )
    throw new Error(
      "Layout owner does not match the selected package binding.",
    );
}

/** Hash покрывает metadata и exact layout pins; bytes renderer/guides и artifact digest сюда не входят. */
export const realizeTemplateLayoutCatalog = createTemplateLayoutCatalog(
  controlPanelLayoutCatalog,
);
