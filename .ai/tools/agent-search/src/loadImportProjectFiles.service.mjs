/**
 * @file .ai/tools/agent-search/src/loadImportProjectFiles.service.mjs
 * @version 1.0.0
 * @date 2026-10-30
 * @description Вычисляет root files явного TypeScript project на закрытом inventory без доступа к host FS.
 * @see documentation/architecture/repository-search.md
 */
import { posix } from "node:path";
import ts from "typescript";
import { IMPORT_RESOLUTION_LIMITS as limits } from "./importResolution.config.mjs";
import { loadImportConfigurationSync } from "./loadImportConfiguration.service.mjs";

/** Selectors принадлежат TypeScript; ACL, config chain и budgets — общему reader. */
export function loadImportProjectFilesSync(context, configPath, files) {
  const config = loadImportConfigurationSync(context, configPath, configPath);
  if (config.reason) return config;
  if (config.configuration?.hasMultipleBases)
    return { reason: "unsupported_configuration" };
  // Export существует в закреплённом runtime TypeScript, но не в public .d.ts.
  // Не заменяем его приблизительным glob: отсутствие API блокирует результат.
  if (typeof ts.matchFiles !== "function")
    return { reason: "unsupported_configuration" };
  if (files.size > limits.inventoryEntries) return { reason: "scan_budget" };
  const tree = new Map();
  const entry = (path) => {
    if (!tree.has(path))
      tree.set(path, { files: new Set(), directories: new Set() });
    return tree.get(path);
  };
  let bytes = 0;
  for (const path of files) {
    context.assertActive();
    if (!canonical(path)) return { reason: "forbidden" };
    bytes += Buffer.byteLength(path);
    if (bytes > limits.inventoryBytes) return { reason: "scan_budget" };
    let directory = posix.dirname("/" + path);
    entry(directory).files.add(posix.basename(path));
    while (directory !== "/") {
      const parent = posix.dirname(directory);
      entry(parent).directories.add(posix.basename(directory));
      directory = parent;
    }
    if (tree.size > limits.graphEntries) return { reason: "scan_budget" };
  }
  let failure;
  const relative = (path) => posix.relative("/", path);
  const read = (path) => {
    context.assertActive();
    const key = relative(path);
    // Compiler читает только уже допущенную общим loader цепочку.
    if (!context.configCache.get(key)?.configuration) return undefined;
    const file = context.read(key, "config");
    if (file.status !== "ok") {
      failure = file.status;
      return undefined;
    }
    const raw = ts.parseConfigFileTextToJson(key, file.text).config;
    if (
      raw?.references?.length ||
      [raw?.files, raw?.include, raw?.exclude].some(
        (values) =>
          Array.isArray(values) &&
          values.some(
            (value) =>
              typeof value === "string" &&
              (value.startsWith("/") || /[\\:\x00-\x1f\x7f]/u.test(value)),
          ),
      )
    ) {
      failure = "unsupported_configuration";
      return undefined;
    }
    return file.text;
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(
    "/" + configPath,
    {},
    {
      useCaseSensitiveFileNames: true,
      getCurrentDirectory: () => "/",
      readFile: read,
      fileExists: (path) => read(path) !== undefined,
      readDirectory: (path, extensions, excludes, includes, depth) =>
        ts.matchFiles(
          path,
          extensions,
          excludes,
          includes,
          true,
          "/",
          depth,
          (directory) => {
            context.assertActive();
            const entries = tree.get(posix.resolve("/", directory));
            return {
              files: [...(entries?.files ?? [])],
              directories: [...(entries?.directories ?? [])],
            };
          },
          (path) => path,
        ),
      onUnRecoverableConfigFileDiagnostic: () => {
        failure = "unsupported_configuration";
      },
    },
  );
  if (failure) return { reason: failure };
  if (!parsed || parsed.errors.length || parsed.projectReferences?.length)
    return { reason: "unsupported_configuration" };
  const roots = new Set(parsed.fileNames.map(relative));
  if (!roots.size || [...roots].some((path) => !files.has(path)))
    return { reason: "unsupported_configuration" };
  return { files: [...roots].sort() };
}

function canonical(path) {
  return (
    typeof path === "string" &&
    path.length <= 4096 &&
    !path.startsWith("/") &&
    !/[\\:\x00-\x1f\x7f]/u.test(path) &&
    path.split("/").every((part) => part && part !== "." && part !== "..")
  );
}
