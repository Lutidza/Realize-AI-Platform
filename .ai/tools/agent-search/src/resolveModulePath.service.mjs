/**
 * @file .ai/tools/agent-search/src/resolveModulePath.service.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Разрешает исходники relative/paths/workspace imports без node_modules, shell и неявного доступа.
 * @see documentation/architecture/repository-search.md
 */
import { posix } from "node:path";
import { isBuiltin } from "node:module";
import { loadImportConfiguration } from "./loadImportConfiguration.service.mjs";

/** File existence устанавливается только успешным чтением через caller policy. */
export async function resolveModulePath(
  context,
  fromPath,
  specifier,
  mode = "import",
) {
  if (typeof specifier !== "string" || !specifier || specifier.length > 4096)
    return { reason: "unsupported_specifier" };
  if (isBuiltin(specifier)) return { reason: "external_dependency" };
  if (/[\\\x00-\x1f\x7f:?#]/u.test(specifier) || specifier.startsWith("/"))
    return { reason: "unsupported_specifier" };
  const config = await loadImportConfiguration(context, fromPath);
  if (config.reason) return config;
  const settings = config.settings;
  if (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  )
    return candidate(posix.join(posix.dirname(fromPath), specifier), true);

  const alias = selectPattern(settings.paths ?? {}, specifier, false);
  if (alias) {
    const base = settings.baseUrl ?? settings.pathsDirectory ?? ".";
    for (const target of alias.value) {
      const result = await candidate(
        posix.join(base, target.replaceAll("*", alias.capture)),
        true,
      );
      if (result.reason !== "not_found") return result;
    }
  }
  if (settings.baseUrl !== undefined) {
    const result = await candidate(
      posix.join(settings.baseUrl, specifier),
      true,
    );
    if (!["not_found", "forbidden"].includes(result.reason)) return result;
  }
  const catalog = await workspaces();
  if (catalog.reason) return catalog;
  const segments = specifier.split("/");
  const name = segments.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
  const subpath = segments.slice(specifier.startsWith("@") ? 2 : 1).join("/");
  const packages = catalog.packages.get(name);
  if (!packages?.length) return { reason: "external_dependency" };
  if (packages.length !== 1) return { reason: "ambiguous" };
  const { directory, manifest } = packages[0];
  if (Object.hasOwn(manifest, "exports") && !settings.legacy) {
    const conditions = new Set([
      "types",
      mode,
      "default",
      ...(settings.conditions ?? []),
    ]);
    const selected = selectExport(
      manifest.exports,
      subpath ? `./${subpath}` : ".",
      conditions,
    );
    if (selected.reason) return selected;
    const target = selected.target;
    if (!safePackageTarget(target))
      return { reason: "unsupported_configuration" };
    // exports — точная цель; directory/index fallback сюда не подмешивается.
    return candidate(posix.join(directory, target), false);
  }
  if (subpath) return candidate(posix.join(directory, subpath), true);
  return directoryEntry(directory, manifest);

  async function candidate(rawPath, allowDirectory) {
    const path = posix.normalize(rawPath);
    if (path === ".." || path.startsWith("../") || path.startsWith("/"))
      return { reason: "forbidden" };
    for (const filePath of fileCandidates(path, settings.suffixes ?? [""])) {
      const file = await context.read(filePath);
      if (file.status === "ok") return { path: filePath, file };
      if (file.status !== "not_found") return { reason: file.status };
    }
    if (!allowDirectory) return { reason: "not_found" };
    const manifest = await json(posix.join(path, "package.json"));
    if (manifest.reason && manifest.reason !== "not_found") return manifest;
    return directoryEntry(path, manifest.value ?? {});
  }

  async function directoryEntry(directory, manifest) {
    if (manifest.typesVersions !== undefined)
      return { reason: "unsupported_configuration" };
    for (const key of ["types", "typings", "main"]) {
      if (manifest[key] === undefined) continue;
      if (
        typeof manifest[key] !== "string" ||
        !safePackageTarget(manifest[key], false)
      )
        return { reason: "unsupported_configuration" };
      const result = await candidate(
        posix.join(directory, manifest[key]),
        false,
      );
      if (result.reason !== "not_found") return result;
      const index = await candidate(
        posix.join(directory, manifest[key], "index"),
        false,
      );
      if (index.reason !== "not_found") return index;
    }
    return candidate(posix.join(directory, "index"), false);
  }

  async function json(path) {
    const key = `json:${path}`;
    if (context.configCache.has(key)) return context.configCache.get(key);
    const file = await context.read(path, "config");
    if (file.status !== "ok") return { reason: file.status };
    let value;
    try {
      value = JSON.parse(file.text.replace(/^\uFEFF/u, ""));
    } catch {
      return { reason: "unsupported_configuration" };
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { reason: "unsupported_configuration" };
    const result = { value };
    context.configCache.set(key, result);
    return result;
  }

  async function workspaces() {
    if (context.configCache.has("workspaces"))
      return context.configCache.get("workspaces");
    const root = await json("package.json");
    if (root.reason && root.reason !== "not_found") return root;
    const declarations = root.value?.workspaces;
    if (
      declarations !== undefined &&
      !Array.isArray(declarations) &&
      (!declarations ||
        typeof declarations !== "object" ||
        !Array.isArray(declarations.packages))
    )
      return { reason: "unsupported_configuration" };
    const patterns = Array.isArray(declarations)
      ? declarations
      : (declarations?.packages ?? []);
    if (!Array.isArray(patterns) || patterns.length > 32)
      return { reason: "unsupported_configuration" };
    const directories = new Set();
    for (const pattern of patterns) {
      if (
        typeof pattern !== "string" ||
        !pattern ||
        posix.normalize(pattern) === "." ||
        pattern.length > 2048 ||
        /[\\:\x00-\x1f!?[\]{}]/u.test(pattern) ||
        pattern.startsWith("/") ||
        pattern.split("/").includes("..") ||
        pattern.split("*").length > 2 ||
        (pattern.includes("*") && !pattern.endsWith("/*"))
      )
        return { reason: "unsupported_configuration" };
      if (!pattern.includes("*")) {
        directories.add(posix.normalize(pattern));
        continue;
      }
      const directory = posix.normalize(pattern.slice(0, -2));
      const listing = await context.listDirectories(directory);
      if (listing.status !== "ok") {
        if (listing.status === "not_found") continue;
        return { reason: listing.status };
      }
      for (const child of listing.directories) directories.add(child);
    }
    const packages = new Map();
    for (const directory of [...directories].sort()) {
      const parsed = await json(posix.join(directory, "package.json"));
      if (parsed.reason) {
        if (parsed.reason === "not_found") continue;
        return parsed;
      }
      if (
        typeof parsed.value.name !== "string" ||
        !parsed.value.name ||
        parsed.value.name.length > 512
      )
        return { reason: "unsupported_configuration" };
      const values = packages.get(parsed.value.name) ?? [];
      values.push({ directory, manifest: parsed.value });
      packages.set(parsed.value.name, values);
    }
    const result = { packages };
    context.configCache.set("workspaces", result);
    return result;
  }
}

function fileCandidates(path, suffixes) {
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

function selectPattern(map, value, preferSuffix = true) {
  if (Object.hasOwn(map, value)) return { value: map[value], capture: "" };
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

function selectExport(exports, subpath, conditions) {
  let selected = exports;
  let capture = "";
  if (exports && typeof exports === "object" && !Array.isArray(exports)) {
    const keys = Object.keys(exports);
    const paths = keys.filter((key) => key.startsWith("."));
    if (paths.length && paths.length !== keys.length)
      return { reason: "unsupported_configuration" };
    if (paths.length) {
      const match = selectPattern(exports, subpath);
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

function safePackageTarget(value, requireDot = true) {
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
