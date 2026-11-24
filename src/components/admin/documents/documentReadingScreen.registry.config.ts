/**
 * @file src/components/admin/documents/documentReadingScreen.registry.config.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Связывает app-owned экран с проверенным project owner и описательной ссылкой на renderer.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { resolveElementOwner } from "@realize/element-registry/server";
import { getElementIdentityKey } from "@realize/element-registry";
import { realizeOwnerRegistry } from "@/registry/realizeOwnerRegistry.config";
import { documentReadingScreenManifest } from "./documentReadingScreen.manifest";

const owner = resolveElementOwner(
  realizeOwnerRegistry,
  documentReadingScreenManifest.owner,
);
if (
  owner.kind !== "project" ||
  getElementIdentityKey(owner.identity) !==
    getElementIdentityKey(realizeOwnerRegistry.rootProject)
)
  throw new Error(
    "Document reading screen must belong to the host project owner.",
  );

/** Server-owned metadata не импортирует React/CSS и не подтверждает установку, activation или editor admission. */
export const documentReadingScreenRegistration = Object.freeze({
  ...documentReadingScreenManifest,
  renderer: Object.freeze({
    path: "src/components/admin/documents/DocumentReadingScreen.component.tsx",
    exportName: "DocumentReadingScreen",
  }),
});
