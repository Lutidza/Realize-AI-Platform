/**
 * @file packages/engineering-runtime/src/filesystem/readFilesystemInventory.service.ts
 * @version 1.0.1
 * @date 2026-10-30
 * @description Перечисляет bounded закрытую область references через descriptor-relative namespaces без усечения.
 * @see documentation/architecture/engineering-operations.md
 */
import type { ManifestEntry } from "./EngineeringFilesystem.types.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";

/** Файлы читаются binding отдельно; namespace evidence включает также пустые каталоги. */
export function readFilesystemInventory(
  readNamespace: (path: string) => ManifestEntry,
  roots: readonly string[],
): string[] {
  if (!roots.length || roots.length > 16)
    failure("LIMIT_EXCEEDED", "Нужна ограниченная область inventory.");
  const files = new Set<string>(),
    visited = new Set<string>();
  const pending = roots.map((path) => ({ path, depth: 0 }));
  while (pending.length) {
    const { path, depth } = pending.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);
    if (depth > 16 || visited.size > 128)
      failure(
        "LIMIT_EXCEEDED",
        "Inventory превышает глубину или число каталогов.",
      );
    const entry = readNamespace(path);
    if (entry.identity?.kind !== "directory" || !entry.children)
      failure(
        "UNSUPPORTED",
        "Inventory root не является существующим каталогом.",
      );
    for (const child of entry.children) {
      const nested = `${path}/${child.name}`;
      if (child.kind === "directory")
        pending.push({ path: nested, depth: depth + 1 });
      else if (child.kind === "file") files.add(nested);
      else failure("UNSUPPORTED", "Inventory содержит неподдержанный объект.");
      if (files.size > 128 || pending.length + visited.size > 128)
        failure(
          "LIMIT_EXCEEDED",
          "Inventory превышает число файлов или каталогов.",
        );
    }
  }
  return [...files].sort();
}
