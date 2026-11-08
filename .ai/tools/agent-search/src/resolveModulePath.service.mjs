/**
 * @file .ai/tools/agent-search/src/resolveModulePath.service.mjs
 * @version 1.2.0
 * @date 2026-11-02
 * @description Разрешает исходники relative/paths/workspace imports без node_modules, shell и неявного доступа.
 * @see documentation/architecture/repository-search.md
 */
import { posix } from "node:path";
import { getModuleFileCandidates } from "./getModuleFileCandidates.util.mjs";
import { isBuiltin } from "node:module";
import {
  loadImportConfiguration,
  loadImportConfigurationSync,
} from "./loadImportConfiguration.service.mjs";

import { runImportReadSteps } from "./runImportReadSteps.service.mjs";
import { selectModulePattern } from "./selectModulePattern.util.mjs";
import { isSyntaxSearchFile } from "./syntaxSearch.config.mjs";
import {
  readPackageExports,
  selectPackageExport,
  isSafePackageTarget,
} from "./readPackageExports.util.mjs";

/** File existence устанавливается только успешным чтением через caller policy. */
export async function resolveModulePath(
  context,
  fromPath,
  specifier,
  mode = "import",
  configPath,
) {
  return runImportReadSteps(
    resolveModulePathSteps(
      context,
      fromPath,
      specifier,
      mode,
      "navigation",
      false,
      configPath,
    ),
  );
}

/** Синхронный caller выбирает navigation либо bounded unique-target relocation policy. */
export function resolveModulePathSync(
  context,
  fromPath,
  specifier,
  mode = "import",
  policy = "navigation",
  configPath,
) {
  return runImportReadSteps(
    resolveModulePathSteps(
      context,
      fromPath,
      specifier,
      mode,
      policy,
      true,
      configPath,
    ),
    true,
  );
}

function* resolveModulePathSteps(
  context,
  fromPath,
  specifier,
  mode,
  policy,
  synchronous = false,
  configPath,
) {
  const strict = policy === "relocation" || policy === "relocation-exports";
  // Exact string exports не имеют mode-dependent ветвей; conditional maps ниже отклоняются.
  if (
    policy === "relocation-exports" &&
    mode !== "import" &&
    mode !== "require"
  )
    return { reason: "unsupported_configuration" };
  if (typeof specifier !== "string" || !specifier || specifier.length > 4096)
    return { reason: "unsupported_specifier" };
  if (isBuiltin(specifier)) return { reason: "external_dependency" };
  if (/[\\\x00-\x1f\x7f:?#]/u.test(specifier) || specifier.startsWith("/"))
    return { reason: "unsupported_specifier" };
  const config = yield synchronous
    ? loadImportConfigurationSync(context, fromPath, configPath)
    : loadImportConfiguration(context, fromPath, configPath);
  if (config.reason) return config;
  const settings = config.settings;
  if (
    strict &&
    (config.configuration?.hasMultipleBases ||
      (settings.suffixes &&
        (settings.suffixes.length !== 1 || settings.suffixes[0] !== "")))
  )
    return { reason: "unsupported_configuration" };
  if (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  )
    return yield* candidate(
      posix.join(posix.dirname(fromPath), specifier),
      true,
    );

  const alias = selectModulePattern(settings.paths ?? {}, specifier, false);
  if (alias) {
    if (
      strict &&
      (settings.baseUrl === undefined ||
        alias.value.length !== 1 ||
        alias.pattern.includes("*") !== alias.value[0].includes("*"))
    )
      return { reason: "unsupported_configuration" };
    const base = settings.baseUrl ?? settings.pathsDirectory ?? ".";
    for (const target of alias.value) {
      const result = yield* candidate(
        posix.join(base, target.replaceAll("*", alias.capture)),
        true,
      );
      if (result.reason !== "not_found") return result;
    }
  }
  if (policy === "relocation") return { reason: "unsupported_specifier" };
  if (settings.baseUrl !== undefined) {
    const result = yield* candidate(
      posix.join(settings.baseUrl, specifier),
      true,
    );
    // Strict package resolution требует доказанного отсутствия baseUrl shadowing.
    if (strict && result.reason !== "not_found")
      return { reason: result.reason ?? "unsupported_configuration" };
    if (!["not_found", "forbidden"].includes(result.reason)) return result;
  }
  const catalog = yield* workspaces();
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
    const exact = strict ? readPackageExports(manifest.exports) : undefined;
    if (exact?.reason) return exact;
    const key = subpath ? `./${subpath}` : ".";
    const selected = exact
      ? exact.targets.has(key)
        ? { target: exact.targets.get(key) }
        : { reason: "not_found" }
      : selectPackageExport(manifest.exports, key, conditions);
    if (selected.reason) return selected;
    const target = selected.target;
    if (!isSafePackageTarget(target))
      return { reason: "unsupported_configuration" };
    // exports — точная цель; directory/index fallback сюда не подмешивается.
    const resolved = yield* candidate(posix.join(directory, target), false);
    return strict && !resolved.reason
      ? {
          ...resolved,
          packageExport: {
            manifestPath: posix.join(directory, "package.json"),
            subpath: key,
            target,
          },
        }
      : resolved;
  }
  if (strict) return { reason: "unsupported_configuration" };
  if (subpath) return yield* candidate(posix.join(directory, subpath), true);
  return yield* directoryEntry(directory, manifest);

  function* candidate(rawPath, allowDirectory) {
    const path = posix.normalize(rawPath);
    if (path === ".." || path.startsWith("../") || path.startsWith("/"))
      return { reason: "forbidden" };
    if (strict) {
      const paths = [
        ...getModuleFileCandidates(path, settings.suffixes ?? [""]),
        ...(allowDirectory && !isSyntaxSearchFile(path)
          ? getModuleFileCandidates(
              posix.join(path, "index"),
              settings.suffixes ?? [""],
            )
          : []),
      ];
      let match;
      for (const filePath of new Set(paths)) {
        const file = yield context.read(filePath);
        if (file.status === "ok") {
          if (match) return { reason: "ambiguous" };
          match = { path: filePath, file };
        } else if (file.status !== "not_found") return { reason: file.status };
      }
      return match ?? { reason: "not_found" };
    }
    for (const filePath of getModuleFileCandidates(
      path,
      settings.suffixes ?? [""],
    )) {
      const file = yield context.read(filePath);
      if (file.status === "ok") return { path: filePath, file };
      if (file.status !== "not_found") return { reason: file.status };
    }
    if (!allowDirectory) return { reason: "not_found" };
    const manifest = yield* json(posix.join(path, "package.json"));
    if (manifest.reason && manifest.reason !== "not_found") return manifest;
    return yield* directoryEntry(path, manifest.value ?? {});
  }

  function* directoryEntry(directory, manifest) {
    if (manifest.typesVersions !== undefined)
      return { reason: "unsupported_configuration" };
    for (const key of ["types", "typings", "main"]) {
      if (manifest[key] === undefined) continue;
      if (
        typeof manifest[key] !== "string" ||
        !isSafePackageTarget(manifest[key], false)
      )
        return { reason: "unsupported_configuration" };
      const result = yield* candidate(
        posix.join(directory, manifest[key]),
        false,
      );
      if (result.reason !== "not_found") return result;
      const index = yield* candidate(
        posix.join(directory, manifest[key], "index"),
        false,
      );
      if (index.reason !== "not_found") return index;
    }
    return yield* candidate(posix.join(directory, "index"), false);
  }

  function* json(path) {
    const key = `json:${path}`;
    if (context.configCache.has(key)) return context.configCache.get(key);
    const file = yield context.read(path, "config");
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

  function* workspaces() {
    if (context.configCache.has("workspaces"))
      return context.configCache.get("workspaces");
    const root = yield* json("package.json");
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
      const listing = yield context.listDirectories(directory);
      if (listing.status !== "ok") {
        if (listing.status === "not_found") continue;
        return { reason: listing.status };
      }
      for (const child of listing.directories) directories.add(child);
    }
    const packages = new Map();
    for (const directory of [...directories].sort()) {
      const parsed = yield* json(posix.join(directory, "package.json"));
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
