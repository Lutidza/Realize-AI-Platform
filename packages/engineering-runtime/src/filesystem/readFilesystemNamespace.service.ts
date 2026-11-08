/**
 * @file packages/engineering-runtime/src/filesystem/readFilesystemNamespace.service.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Переиспользует снимок одного namespace внутри плана до обязательной финальной сверки.
 * @see documentation/architecture/engineering-operations.md
 */
import type { DescriptorFilesystem } from "./DescriptorFilesystem.adapter.ts";
import type { ManifestEntry } from "./EngineeringFilesystem.types.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";

/** Caller проверяет ACL; frozen manifest повторно сверяет также отрицательные probes. */
export function readFilesystemNamespace(
  filesystem: DescriptorFilesystem,
  path: string,
  observed: Map<string, ManifestEntry>,
): ManifestEntry {
  const cached = observed.get(path);
  if (cached) return cached;
  if (observed.size >= 512)
    failure("LIMIT_EXCEEDED", "Слишком много namespace snapshots.");
  const entry = filesystem.entry(path);
  if (entry.identity && entry.identity.kind !== "directory")
    failure("UNSUPPORTED", "Namespace не является каталогом.");
  observed.set(path, entry);
  return entry;
}
