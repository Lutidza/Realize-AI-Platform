/**
 * @file .ai/tools/agent-search/src/selectModulePattern.util.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Выбирает exact или wildcard mapping с общим порядком paths и package exports.
 * @see documentation/architecture/repository-search.md
 */
export function selectModulePattern(map, value, preferSuffix = true) {
  if (Object.hasOwn(map, value))
    return { pattern: value, value: map[value], capture: "" };
  const matches = [];
  for (const [pattern, target] of Object.entries(map)) {
    const star = pattern.indexOf("*");
    if (star < 0 || pattern.lastIndexOf("*") !== star) continue;
    const prefix = pattern.slice(0, star),
      suffix = pattern.slice(star + 1);
    if (
      value.length >= prefix.length + suffix.length &&
      value.startsWith(prefix) &&
      value.endsWith(suffix)
    )
      matches.push({
        pattern,
        value: target,
        capture: value.slice(prefix.length, value.length - suffix.length),
        prefix: prefix.length,
        suffix: suffix.length,
      });
  }
  return matches.sort(
    (a, b) => b.prefix - a.prefix || (preferSuffix ? b.suffix - a.suffix : 0),
  )[0];
}
