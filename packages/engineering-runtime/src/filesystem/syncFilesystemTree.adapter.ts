/**
 * @file packages/engineering-runtime/src/filesystem/syncFilesystemTree.adapter.ts
 * @version 1.0.0
 * @date 2026-10-28
 * @description Синхронизирует exact tree до/после rename, проверяя каждую identity и полный namespace.
 * @see documentation/architecture/engineering-operations.md
 */
import { closeSync, fsyncSync } from "node:fs";
import {
  identityFromFd,
  openReadonlyEntry,
} from "./DescriptorFilesystem.adapter.ts";
import type { DescriptorFilesystem } from "./DescriptorFilesystem.adapter.ts";
import type { ManifestEntry } from "./EngineeringFilesystem.types.ts";
import { baseName, parentPath } from "./creationManifest.service.ts";
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";

/** Сначала содержимое, затем deepest-first каталоги; after не заменяет fsync при recovery. */
export function syncFilesystemTree(
  filesystem: DescriptorFilesystem,
  entries: readonly ManifestEntry[],
  from: string,
  to: string,
): void {
  const ordered = [...entries].sort(
    (a, b) =>
      Number(a.identity?.kind === "directory") -
        Number(b.identity?.kind === "directory") ||
      b.path.length - a.path.length,
  );
  for (const entry of ordered) {
    const path = to + entry.path.slice(from.length);
    const expected = { ...entry, path };
    if (
      hashEngineeringValue(filesystem.entry(path)) !==
      hashEngineeringValue(expected)
    )
      failure("CONFLICT", "Дерево изменилось до durability barrier.");
    const parent = filesystem.openDirectory(parentPath(path));
    let object: number | undefined;
    try {
      object = openReadonlyEntry(parent, baseName(path));
      if (
        hashEngineeringValue(identityFromFd(object, filesystem.native)) !==
        hashEngineeringValue(entry.identity)
      )
        failure("CONFLICT", "Tree identity изменилась до fsync.");
      fsyncSync(object);
    } finally {
      if (object !== undefined) closeSync(object);
      closeSync(parent);
    }
    if (
      hashEngineeringValue(filesystem.entry(path)) !==
      hashEngineeringValue(expected)
    )
      failure("CONFLICT", "Дерево изменилось во время durability barrier.");
  }
}
