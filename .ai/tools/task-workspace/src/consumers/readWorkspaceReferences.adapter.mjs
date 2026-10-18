/**
 * @file .ai/tools/task-workspace/src/consumers/readWorkspaceReferences.adapter.mjs
 * @version 1.1.3
 * @date 2026-10-16
 * @description Обходит ограниченную область исходников и соседних TASK.md для поиска потребителей.
 * @see documentation/specifications/task-management-execution.md
 */
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { fail } from "../Workspace.error.mjs";
import { matchWorkspaceReferences } from "./matchWorkspaceReferences.util.mjs";
import { workspaceReferenceScope } from "./workspaceReferenceScope.config.mjs";

const {
  roots,
  skippedNames,
  skippedPaths,
  protectedNames,
  supportedExtensions,
  dossierRoots,
  maxFiles,
  maxDossiers,
  maxBytes,
} = workspaceReferenceScope;

/**
 * Возвращает только пути потребителей; собственные logs/tmp и содержимое документов не выдаются.
 * Превышение бюджета отклоняет весь поиск, поскольку отсутствие потребителей не установлено.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} relative
 * @returns {string[]}
 */
export function readWorkspaceReferences(storage, relative) {
  const target = safeRelative(relative);
  const ownDossier =
    /^\.ai-workspace\/(?:tasks|history)\/[^/]+/.exec(target)?.[0] ?? null;
  /** @type {Set<string>} */
  const hits = new Set();
  let count = 0;
  /** @param {string} file */
  const stat = (file) => {
    try {
      return storage.stat(file);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT")
        return null;
      throw error;
    }
  };
  /**
   * @param {string} file
   * @param {boolean} dossier
   * @returns {void}
   */
  const inspect = (file, dossier = false) => {
    if (++count > maxFiles) fail("reference_scan_limit");
    const entry = stat(file);
    if (!entry || entry.isSymbolicLink()) return;
    if (entry.isDirectory()) {
      for (const name of storage.list(file)) {
        const child = `${file}/${name}`;
        if (
          skippedNames.has(name) ||
          skippedPaths.some((pattern) => pattern.test(child)) ||
          protectedNames.some((pattern) => pattern.test(name))
        )
          continue;
        inspect(child);
      }
      return;
    }
    if (!entry.isFile() || !supportedExtensions.test(file)) return;
    if (entry.size > BigInt(maxBytes))
      fail(
        "reference_scan_limit",
        "Поиск ссылок неполон: файл превышает допустимый размер.",
      );
    const text = storage.read(file, maxBytes).toString("utf8");
    if (matchWorkspaceReferences(storage.root, file, text, target, dossier))
      hits.add(file);
  };
  for (const root of roots) inspect(root);

  // Читаются только соседние TASK.md: их evidence/tmp не входят в рекурсивный обход.
  let dossiers = 0;
  for (const base of dossierRoots) {
    const parent = stat(base);
    if (!parent || parent.isSymbolicLink() || !parent.isDirectory()) continue;
    for (const name of storage.list(base)) {
      if (++dossiers > maxDossiers) fail("reference_scan_limit");
      const directory = `${base}/${name}`;
      if (directory === ownDossier) continue;
      const entry = stat(directory);
      if (!entry || entry.isSymbolicLink() || !entry.isDirectory()) continue;
      inspect(`${directory}/TASK.md`, true);
    }
  }
  return [...hits].sort();
}
