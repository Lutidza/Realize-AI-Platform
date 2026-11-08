/**
 * @file packages/engineering-runtime/src/filesystem/readFilesystemTree.service.ts
 * @version 1.0.1
 * @date 2026-10-30
 * @description Читает полный bounded tree и вычисляет его версию по names, identity, mode и bytes.
 * @see documentation/architecture/engineering-operations.md
 */
import type { DescriptorFilesystem } from "./DescriptorFilesystem.adapter.ts";
import type {
  FilesystemTree,
  ManifestEntry,
} from "./EngineeringFilesystem.types.ts";
import { readFilesystemInventory } from "./readFilesystemInventory.service.ts";
import { readFilesystemNamespace } from "./readFilesystemNamespace.service.ts";
import { foldedName, readManifest } from "./creationManifest.service.ts";
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";

export function readFilesystemTree(
  filesystem: DescriptorFilesystem,
  root: string,
): FilesystemTree {
  const directories = new Map<string, ManifestEntry>();
  const files = readFilesystemInventory(
    (path) => readFilesystemNamespace(filesystem, path, directories),
    [root],
  );
  const paths = [...directories.keys(), ...files].sort();
  if (paths.length > 32)
    failure(
      "LIMIT_EXCEEDED",
      "Directory move поддерживает не более 32 объектов вместе с корнем.",
    );
  const entries = readManifest(filesystem, paths);
  for (const entry of entries) {
    if (!entry.identity)
      failure("CONFLICT", "Объект дерева исчез во время чтения.");
    const original = directories.get(entry.path);
    if (
      original &&
      hashEngineeringValue(original) !== hashEngineeringValue(entry)
    )
      failure("CONFLICT", "Namespace дерева изменился во время чтения.");
    const names = entry.children?.map((child) => foldedName(child.name)) ?? [];
    if (new Set(names).size !== names.length)
      failure("CONFLICT", "В дереве есть case/Unicode namespace collision.");
  }
  const version = hashEngineeringValue({
    schemaVersion: 1,
    entries: entries.map((entry) => ({
      ...entry,
      path: entry.path === root ? "" : entry.path.slice(root.length + 1),
    })),
  });
  return { version, entries };
}
