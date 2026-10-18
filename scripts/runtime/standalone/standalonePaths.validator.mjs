/**
 * @file scripts/runtime/standalone/standalonePaths.validator.mjs
 * @version 1.0.0
 * @date 2026-10-18
 * @description Проверяет границы и недопустимые пути переносимого standalone-пакета.
 * @see documentation/delivery/01-local-admin-ai.md
 */
import { isAbsolute, relative, sep } from "node:path";

/** Проверяет принадлежность пути каталогу, включая сам каталог. */
export function isWithinStandalone(root, candidate) {
  const path = relative(root, candidate);
  return (
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  );
}

/** Runtime storage и секреты не являются входом переносимой сборки. */
export function assertStandalonePath(path) {
  if (
    /(?:^|\/)(?:\.env[^/]*|\.git|\.codex|\.ssh|\.local|(?:config-)?auth\.json|credentials(?:\.json)?)(?:\/|$)|\.(?:pem|key|sqlite3?|db)(?:-(?:wal|shm|journal))?(?:\/|$)|\/\.ai\/tools\/[^/]+\/runtime(?:\/|$)/i.test(
      path,
    )
  ) {
    throw new Error("Standalone отклонил private/runtime path.");
  }
}
