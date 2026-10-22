/**
 * @file .ai/tools/git-delivery/src/commit/validateGitChanges.validator.ts
 * @version 1.1.2
 * @date 2026-10-22
 * @description Проверяет разрешённые пути и статусы перед подготовкой commit.
 */
import { PolicyError } from "@realize/git-runtime";
import type { Snapshot } from "../GitSnapshot.types.ts";

/** Общий путь commit/approved-tree merge исключает секреты и локальные generated артефакты. */
export function assertAllowedGitChangedPaths(paths: string[]): void {
  if (paths.length > 2048)
    throw new PolicyError("scope_limit", "Состав превышает 2048 файлов.");
  for (const path of paths) {
    if (
      /(^|\/)(?:node_modules|\.next|dist|coverage)(\/|$)/i.test(path) ||
      /^\.ai-workspace\/tasks\//.test(path) ||
      /^\.ai\/tools\/agent-runtime\/runtime\/(?!INDEX\.md$|schemas\/)/.test(
        path,
      ) ||
      (/(^|\/)\.env(?:\.|$)/i.test(path) &&
        !/(^|\/)\.env\.example$/.test(path)) ||
      /(^|\/)(?:id_rsa|id_ed25519|credentials\.json)$|\.(?:pem|p12|pfx|key)$/i.test(
        path,
      )
    )
      throw new PolicyError(
        "protected_path",
        "В состав попал секрет или локальный артефакт; уточните область.",
      );
  }
}

/** Полный рабочий снимок допускает частичный индекс только по отдельному разрешению контекста. */
export function validateChanges(
  snapshot: Snapshot,
  ownedPartialPaths: ReadonlySet<string> = new Set(),
  includePartialIndex = false,
): string[] {
  const paths = snapshot.changes.map((change) => change.path);
  if (paths.length > 2048)
    throw new PolicyError("scope_limit", "Состав превышает 2048 файлов.");
  if (new Set(paths).size !== paths.length) {
    throw new PolicyError(
      "partial_index",
      "Один путь одновременно удалён из индекса и создан заново; требуется отдельное решение.",
    );
  }
  for (const { path, status } of snapshot.changes) {
    if (status.includes("U") || ["AA", "DD"].includes(status)) {
      throw new PolicyError(
        "unmerged_index",
        "Сначала требуется разрешить конфликт индекса.",
      );
    }
    if (
      status !== "??" &&
      status[0] !== " " &&
      status[1] !== " " &&
      !ownedPartialPaths.has(path) &&
      !includePartialIndex
    ) {
      throw new PolicyError(
        "partial_index",
        "Частично подготовленный файл требует отдельного решения.",
      );
    }
    assertAllowedGitChangedPaths([path]);
  }
  return paths;
}
