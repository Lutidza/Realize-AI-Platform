/**
 * @file src/components/admin/documents/documentListScreen.registry.config.ts
 * @version 1.0.1
 * @date 2026-11-24
 * @description Связывает описание списка с владельцем проекта и ссылкой на renderer.
 * @see documentation/specifications/realize-ai-control-panel/documents/list.md
 */
import { getElementIdentityKey } from "@realize/element-registry";
import { resolveElementOwner } from "@realize/element-registry/server";
import { realizeOwnerRegistry } from "@/registry/realizeOwnerRegistry.config";
import { documentListScreenManifest } from "./documentListScreen.manifest";

const owner = resolveElementOwner(
  realizeOwnerRegistry,
  documentListScreenManifest.owner,
);
if (
  owner.kind !== "project" ||
  getElementIdentityKey(owner.identity) !==
    getElementIdentityKey(realizeOwnerRegistry.rootProject)
)
  throw new Error(
    "Document list screen must belong to the host project owner.",
  );

/** Server registration разрешает project owner и хранит декларативную ссылку на React renderer. */
export const documentListScreenRegistration = Object.freeze({
  ...documentListScreenManifest,
  renderer: Object.freeze({
    path: "src/components/admin/documents/DocumentListScreen.component.tsx",
    exportName: "DocumentListScreen",
  }),
});
