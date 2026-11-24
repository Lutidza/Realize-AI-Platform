/**
 * @file src/registry/realizeElementOwnerBindings.config.ts
 * @version 1.0.3
 * @date 2026-11-22
 * @description Связывает элементы host с явно зарегистрированными владельцами.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { elementIdentitySchema } from "@realize/element-registry";
import { resolveElementOwner } from "@realize/element-registry/server";
import { controlPanelManifest } from "@realize/template-realizeai-control-panel/manifest";
import { controlPanelLayoutCatalog } from "@realize/template-realizeai-control-panel/layouts";
import { controlPanelPackageOwnerRegistration } from "@realize/template-realizeai-control-panel/registry";
import { pageAgentManifest } from "@/collections/Pages/pageAgent.manifest";
import { documentListScreenRegistration } from "@/components/admin/documents/documentListScreen.registry.config";
import { documentReadingScreenRegistration } from "@/components/admin/documents/documentReadingScreen.registry.config";
import { realizeOwnerRegistry } from "./realizeOwnerRegistry.config";
import type { RealizeElementOwnerBinding } from "./RealizeElementOwnerBinding.types";

const templateSource = {
  templateId: controlPanelManifest.id,
  templateVersion: controlPanelManifest.version,
};
const packageOwner = {
  identity: resolveElementOwner(realizeOwnerRegistry, {
    identity: controlPanelPackageOwnerRegistration.identity,
  }).identity,
};
const palette = controlPanelManifest.palettes.find(
  (item) => item.id === "realizeai-control-panel",
);
if (!palette) throw new Error("Control Panel palette source is unavailable.");

// Owner относится к global identity. Все exact aliases остаются в layout catalog;
// здесь достаточно одного native source на identity, даже при нескольких aliases/versions.
const layoutBindings = new Map<string, RealizeElementOwnerBinding>();
for (const alias of controlPanelLayoutCatalog.aliases) {
  const identity = alias.layout.identity;
  const key = `${identity.namespace}/${identity.id}`;
  if (!layoutBindings.has(key))
    layoutBindings.set(key, {
      identity,
      kind: "layout",
      owner: packageOwner,
      source: { ...templateSource, layoutId: alias.localId },
    });
}

/** Read-only host mapping не является новым назначением или публикацией ElementDescriptor. */
export const realizeElementOwnerBindings: readonly RealizeElementOwnerBinding[] =
  [
    ...[documentReadingScreenRegistration, documentListScreenRegistration].map(
      (component) => ({
        identity: component.identity,
        kind: "component" as const,
        owner: component.owner,
        source: {
          definitionId: component.identity.id,
          definitionVersion: component.version,
          renderer: component.renderer,
        },
      }),
    ),
    {
      identity: elementIdentitySchema.parse({
        namespace: "realize",
        id: "pages",
      }),
      kind: "collection",
      owner: { identity: realizeOwnerRegistry.rootProject },
      source: {
        definitionId: pageAgentManifest.id,
        definitionVersion: pageAgentManifest.version,
      },
    },
    {
      identity: elementIdentitySchema.parse({
        namespace: "realize",
        id: "realizeai-control-panel",
      }),
      kind: "template",
      owner: packageOwner,
      source: templateSource,
    },
    {
      identity: elementIdentitySchema.parse({
        namespace: "realize",
        id: "realizeai-control-panel.palette",
      }),
      kind: "palette",
      owner: packageOwner,
      source: {
        ...templateSource,
        paletteId: palette.id,
        paletteVersion: palette.version,
      },
    },
    ...layoutBindings.values(),
  ];

// Полное сопоставление проверяется при подключении; неизвестный owner не заменяется проектом.
for (const binding of realizeElementOwnerBindings)
  resolveElementOwner(realizeOwnerRegistry, binding.owner);
