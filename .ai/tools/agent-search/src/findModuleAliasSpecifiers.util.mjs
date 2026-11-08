/**
 * @file .ai/tools/agent-search/src/findModuleAliasSpecifiers.util.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Находит обратные exact/wildcard mappings effective tsconfig для последующей проверки resolver.
 * @see documentation/architecture/repository-search.md
 */
import { posix } from "node:path";
import { selectModulePattern } from "./selectModulePattern.util.mjs";
import { styleModuleTarget } from "./styleModuleTarget.util.mjs";

/** При sourceSpecifier сохраняется стиль расширения; существование проверяет общий resolver. */
export function findModuleAliasSpecifiers(settings, target, sourceSpecifier) {
  if (settings.baseUrl === undefined) return [];
  const results = new Set();
  const targets = new Set([target]);
  if (sourceSpecifier !== undefined)
    targets.add(styleModuleTarget(target, sourceSpecifier));
  for (const [pattern, mappings] of Object.entries(settings.paths ?? {})) {
    if (
      mappings.length !== 1 ||
      pattern.includes("*") !== mappings[0].includes("*")
    )
      continue;
    const mapping = posix.join(settings.baseUrl, mappings[0]);
    if (!pattern.includes("*")) {
      if (
        targets.has(mapping) &&
        (sourceSpecifier === undefined ||
          styleModuleTarget(pattern, sourceSpecifier) === pattern)
      )
        results.add(pattern);
      continue;
    }
    const [prefix, suffix] = mapping.split("*");
    for (const candidate of targets) {
      if (
        candidate.length < prefix.length + suffix.length ||
        !candidate.startsWith(prefix) ||
        !candidate.endsWith(suffix)
      )
        continue;
      const capture = candidate.slice(
        prefix.length,
        candidate.length - suffix.length,
      );
      const specifier = pattern.replace("*", capture);
      if (
        sourceSpecifier !== undefined &&
        styleModuleTarget(specifier, sourceSpecifier) !== specifier
      )
        continue;
      if (
        selectModulePattern(settings.paths, specifier, false)?.pattern ===
        pattern
      )
        results.add(specifier);
    }
  }
  return [...results].sort();
}
