/**
 * @file .ai/tools/agent-search/src/matchesSearchCandidate.util.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Применяет область, расширения и glob к CLI-кандидату до чтения содержимого.
 */
import {
  matchesExcludedPath,
  matchesSearchGlob,
} from "./matchesSearchGlob.util.mjs";

export function matchesSearchCandidate(filePath, options, scope) {
  if (
    !scope.paths.some(
      (selected) =>
        filePath === selected || filePath.startsWith(`${selected}/`),
    )
  )
    return false;
  if (
    options.extensions.length &&
    !options.extensions.some((ext) => filePath.endsWith(`.${ext}`))
  )
    return false;
  const positive = options.globs.filter((glob) => !glob.startsWith("!"));
  if (
    positive.length &&
    !positive.some((glob) => matchesSearchGlob(filePath, glob))
  )
    return false;
  if (
    options.globs.some(
      (glob) =>
        glob.startsWith("!") && matchesExcludedPath(filePath, [glob.slice(1)]),
    )
  )
    return false;
  if (options.output !== "paths") return true;
  return matchesSearchGlob(
    options.ignoreCase ? filePath.toLowerCase() : filePath,
    options.ignoreCase ? options.query.toLowerCase() : options.query,
  );
}
