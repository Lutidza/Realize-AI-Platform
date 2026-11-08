/**
 * @file packages/engineering-runtime/src/filesystem/selectManifestTree.util.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Выделяет физические объекты дерева из manifest, сохраняя negative probes отдельными guards.
 * @see documentation/architecture/engineering-operations.md
 */
import type { ManifestEntry } from "./EngineeringFilesystem.types.ts";

/** Общая выборка для ожидаемых snapshots и fsync до/после rename, включая recovery. */
export function selectManifestTree(
  entries: readonly ManifestEntry[],
  root: string,
): ManifestEntry[] {
  return entries.filter(
    (entry) =>
      entry.identity !== null &&
      (entry.path === root || entry.path.startsWith(root + "/")),
  );
}
