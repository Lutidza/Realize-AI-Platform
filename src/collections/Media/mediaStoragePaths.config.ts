/**
 * @file src/collections/Media/mediaStoragePaths.config.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Определяет приватные каталоги native upload вне публичного дерева Next.
 * @see documentation/specifications/media-management.md
 */
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

function canonicalPath(value: string): string {
  let ancestor = value;
  const missing: string[] = [];
  while (true) {
    try {
      lstatSync(ancestor);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error("Каталог хранения недоступен.");
    ancestor = parent;
  }
  return path.join(realpathSync(ancestor), ...missing);
}

/** Проверяет и существующие symlink-предки; каталог создаёт штатный upload Payload. */
export function resolveMediaStoragePaths(
  storageRoot = process.env.MEDIA_PRIVATE_STORAGE_DIR,
  projectRoot = process.cwd(),
) {
  const root = path.resolve(projectRoot, storageRoot || ".data/media");
  const publicRoots = ["public", ".next/static"].map((directory) =>
    canonicalPath(path.resolve(projectRoot, directory)),
  );
  const locations = {
    originals: path.join(root, "originals"),
    variants: path.join(root, "variants"),
  };
  for (const location of Object.values(locations)) {
    for (const publicRoot of publicRoots) {
      const relative = path.relative(publicRoot, canonicalPath(location));
      if (
        relative === "" ||
        (!relative.startsWith(`..${path.sep}`) &&
          relative !== ".." &&
          !path.isAbsolute(relative))
      ) {
        throw new Error(
          "Исходники и варианты нельзя хранить в публичном каталоге.",
        );
      }
    }
  }
  return Object.freeze(locations);
}

export const mediaStoragePaths = resolveMediaStoragePaths();
