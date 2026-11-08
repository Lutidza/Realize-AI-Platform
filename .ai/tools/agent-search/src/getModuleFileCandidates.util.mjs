/**
 * @file .ai/tools/agent-search/src/getModuleFileCandidates.util.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Формирует единый порядок TS/JS кандидатов модуля без чтения файлов и выбора политики разрешения.
 * @see documentation/architecture/repository-search.md
 */
import { posix } from "node:path";

/** Поиск выбирает первый доступный кандидат; mutation consumer отдельно требует однозначность inventory. */
export function getModuleFileCandidates(path, suffixes = [""]) {
  const ending = posix.extname(path);
  const extension = /\.d\.(?:ts|mts|cts)$/u.test(path)
    ? path.slice(path.lastIndexOf(".d."))
    : [
          ".js",
          ".jsx",
          ".mjs",
          ".cjs",
          ".ts",
          ".tsx",
          ".mts",
          ".cts",
          ".json",
        ].includes(ending)
      ? ending
      : "";
  const substitutions =
    extension === ".jsx" || extension === ".tsx"
      ? [".tsx", ".ts", ".d.ts", ".jsx", ".js"]
      : extension === ".js" || extension === ".ts"
        ? [".ts", ".tsx", ".d.ts", ".js", ".jsx"]
        : extension === ".mjs" || extension === ".mts"
          ? [".mts", ".d.mts", ".mjs"]
          : extension === ".cjs" || extension === ".cts"
            ? [".cts", ".d.cts", ".cjs"]
            : extension
              ? [extension]
              : [".ts", ".tsx", ".d.ts", ".js", ".jsx"];
  const base = extension ? path.slice(0, -extension.length) : path;
  const result = [
    ...new Set(
      substitutions.flatMap((ext) =>
        suffixes.map((suffix) => `${base}${suffix}${ext}`),
      ),
    ),
  ];
  if (!extension && ending)
    result.unshift(`${path.slice(0, -ending.length)}.d${ending}.ts`);
  if (extension && !extension.startsWith(".d.") && extension !== ".json")
    result.push(
      ...[".ts", ".tsx", ".d.ts", ".js", ".jsx"].flatMap((ext) =>
        suffixes.map((suffix) => `${path}${suffix}${ext}`),
      ),
    );
  return result;
}
