/**
 * @file .ai/tools/engineering/src/mapMovedArtifactPath.util.ts
 * @version 1.0.0
 * @date 2026-10-28
 * @description Отображает точный source path и его потомков в путь перенесённого артефакта.
 * @see documentation/architecture/engineering-operations.md
 */
export function mapMovedArtifactPath(
  path: string,
  from: string,
  to: string,
): string {
  return path === from || path.startsWith(from + "/")
    ? to + path.slice(from.length)
    : path;
}
