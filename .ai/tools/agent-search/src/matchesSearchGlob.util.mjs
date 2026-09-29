/**
 * @file .ai/tools/agent-search/src/matchesSearchGlob.util.mjs
 * @version 1.0.1
 * @date 2026-09-26
 * @description Сопоставляет относительный путь с glob и исключениями его родителей.
 */
import { posix } from "node:path";
import picomatch from "picomatch";

const matchers = new Map();

export function matchesSearchGlob(filePath, pattern) {
  const normalized = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  const candidate = pattern.includes("/") ? filePath : posix.basename(filePath);
  let matcher = matchers.get(normalized);
  if (!matcher) {
    // В rg круглые скобки и | буквальные, включая Next route groups.
    // Готовые шаблоны живут только в текущем процессе, не пересобираются на каждый путь.
    const glob = normalized.replace(/\\.|[()|]/gu, (token) =>
      token.startsWith("\\") ? token : `\\${token}`,
    );
    matcher = picomatch.makeRe(glob, {
      dot: true,
      nonegate: true,
      noext: true,
      regex: false,
      keepQuotes: true,
      literalBrackets: false,
      posix: true,
      windows: false,
    });
    matchers.set(normalized, matcher);
  }
  return matcher.test(candidate) || matcher.test(`${candidate}/`);
}

export function matchesExcludedPath(filePath, patterns) {
  const parts = filePath.split("/");
  while (parts.length) {
    if (patterns.some((pattern) => matchesSearchGlob(parts.join("/"), pattern)))
      return true;
    parts.pop();
  }
  return false;
}
