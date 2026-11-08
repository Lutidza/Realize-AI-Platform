/**
 * @file .ai/tools/agent-search/src/readPackageExports.util.mjs
 * @version 1.0.0
 * @date 2026-10-30
 * @description Выбирает package exports и проверяет точный контракт для разрешённого переноса.
 * @see documentation/architecture/repository-search.md
 */
import { posix } from "node:path";
import { IMPORT_RESOLUTION_LIMITS } from "./importResolution.config.mjs";
import { selectModulePattern } from "./selectModulePattern.util.mjs";
import { isSyntaxSearchFile } from "./syntaxSearch.config.mjs";

/** Mutation caller принимает только плоские exact exports; navigation сохраняет отдельный selector. */
export function readPackageExports(value) {
  const entries =
    typeof value === "string"
      ? [[".", value]]
      : value && typeof value === "object" && !Array.isArray(value)
        ? Object.entries(value)
        : [];
  if (entries.length > IMPORT_RESOLUTION_LIMITS.graphEntries)
    return { reason: "scan_budget" };
  if (
    !entries.length ||
    entries.some(
      ([key, target]) =>
        (key !== "." &&
          (!isSafePackageTarget(key) ||
            key.includes("*") ||
            key.endsWith("/") ||
            key !== "./" + posix.normalize(key))) ||
        typeof target !== "string" ||
        !isSafePackageTarget(target) ||
        target.includes("*") ||
        target !== "./" + posix.normalize(target) ||
        !isSyntaxSearchFile(target),
    )
  )
    return { reason: "unsupported_configuration" };
  return { targets: new Map(entries) };
}

export function selectPackageExport(exports, subpath, conditions) {
  let selected = exports;
  let capture = "";
  if (exports && typeof exports === "object" && !Array.isArray(exports)) {
    const keys = Object.keys(exports);
    const paths = keys.filter((key) => key.startsWith("."));
    if (paths.length && paths.length !== keys.length)
      return { reason: "unsupported_configuration" };
    if (paths.length) {
      const match = selectModulePattern(exports, subpath);
      if (!match) return { reason: "not_found" };
      selected = match.value;
      capture = match.capture;
    } else if (subpath !== ".") return { reason: "not_found" };
  } else if (subpath !== ".") return { reason: "not_found" };
  const result = visit(selected, 0);
  return result ?? { reason: "not_found" };
  function visit(value, depth) {
    if (depth > 8 || Array.isArray(value))
      return { reason: "unsupported_configuration" };
    if (value === null) return { reason: "not_found" };
    if (typeof value === "string")
      return { target: value.replaceAll("*", capture) };
    if (!value || typeof value !== "object")
      return { reason: "unsupported_configuration" };
    for (const [condition, target] of Object.entries(value)) {
      if (condition.startsWith("types@") || /^\d+$/u.test(condition))
        return { reason: "unsupported_configuration" };
      if (conditions.has(condition)) {
        const result = visit(target, depth + 1);
        // Вложенные условия без совпадения допускают следующий ключ; null явно закрывает путь.
        if (result !== undefined) return result;
      }
    }
    return undefined;
  }
}

export function isSafePackageTarget(value, requireDot = true) {
  return (
    value.length > 0 &&
    value.length <= 4096 &&
    (!requireDot || value.startsWith("./")) &&
    !value.startsWith("/") &&
    !/[\\:\x00-\x1f%?#]/u.test(value) &&
    !value
      .split("/")
      .some((segment) => segment === ".." || segment === "node_modules")
  );
}
