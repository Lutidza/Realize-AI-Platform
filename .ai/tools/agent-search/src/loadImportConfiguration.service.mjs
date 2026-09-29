/**
 * @file .ai/tools/agent-search/src/loadImportConfiguration.service.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Загружает ближайший tsconfig и относительные extends только через разрешённый bounded reader.
 */
import { posix } from "node:path";
import ts from "typescript";
import { IMPORT_RESOLUTION_LIMITS as limits } from "./importResolution.config.mjs";

export async function loadImportConfiguration(context, fromPath) {
  let directory = posix.dirname(fromPath);
  const key = `nearest:${directory}`;
  if (context.configCache.has(key)) return context.configCache.get(key);
  let result;
  for (let depth = 0; depth < 64; depth++) {
    const path = posix.join(directory, "tsconfig.json");
    const file = await context.read(path, "config");
    if (file.status === "ok") {
      result = await load(path, new Set());
      break;
    }
    if (file.status !== "not_found") {
      result = { reason: file.status };
      break;
    }
    if (directory === ".") {
      result = { settings: {} };
      break;
    }
    directory = posix.dirname(directory);
  }
  result ??= { reason: "unsupported_configuration" };
  context.configCache.set(key, result);
  return result;

  async function load(path, visited) {
    context.assertActive();
    if (visited.has(path) || visited.size >= limits.configDepth)
      return { reason: "unsupported_configuration" };
    if (context.configCache.has(path)) return context.configCache.get(path);
    const stack = new Set([...visited, path]);
    const file = await context.read(path, "config");
    if (file.status !== "ok")
      return {
        reason:
          file.status === "not_found"
            ? "unsupported_configuration"
            : file.status,
      };
    const parsed = ts.parseConfigFileTextToJson(path, file.text);
    if (parsed.error || !object(parsed.config))
      return { reason: "unsupported_configuration" };
    let settings = {};
    const baseConfigs =
      parsed.config.extends === undefined
        ? []
        : Array.isArray(parsed.config.extends)
          ? parsed.config.extends
          : [parsed.config.extends];
    if (baseConfigs.length > limits.configDepth)
      return { reason: "unsupported_configuration" };
    for (const relative of baseConfigs) {
      if (
        typeof relative !== "string" ||
        !relative.startsWith(".") ||
        /[\\:\x00-\x1f]/u.test(relative)
      )
        return { reason: "unsupported_configuration" };
      let basePath = posix.normalize(posix.join(posix.dirname(path), relative));
      if (!basePath.endsWith(".json")) basePath += ".json";
      const base = await load(basePath, stack);
      if (base.reason) return base;
      settings = { ...settings, ...base.settings };
    }
    const own = parsed.config.compilerOptions ?? {};
    if (!object(own)) return { reason: "unsupported_configuration" };
    // Эти настройки меняют пространство поиска; молча имитировать compiler resolution нельзя.
    if (
      own.rootDirs?.length ||
      (own.moduleResolution !== undefined &&
        !["bundler", "node", "node10"].includes(
          String(own.moduleResolution).toLowerCase(),
        ))
    )
      return { reason: "unsupported_configuration" };
    if (own.moduleResolution !== undefined)
      settings.legacy =
        String(own.moduleResolution).toLowerCase() !== "bundler";
    if (own.baseUrl !== undefined) {
      if (!relativeValue(own.baseUrl))
        return { reason: "unsupported_configuration" };
      settings.baseUrl = posix.normalize(
        posix.join(posix.dirname(path), own.baseUrl),
      );
    }
    if (own.paths !== undefined) {
      if (!object(own.paths) || Object.keys(own.paths).length > 128)
        return { reason: "unsupported_configuration" };
      for (const [pattern, targets] of Object.entries(own.paths))
        if (
          !pattern ||
          pattern.length > 512 ||
          pattern.split("*").length > 2 ||
          !Array.isArray(targets) ||
          !targets.length ||
          targets.length > 16 ||
          targets.some(
            (target) => !relativeValue(target) || target.split("*").length > 2,
          )
        )
          return { reason: "unsupported_configuration" };
      settings.paths = own.paths;
      settings.pathsDirectory = posix.dirname(path);
    }
    if (own.moduleSuffixes !== undefined) {
      if (
        !Array.isArray(own.moduleSuffixes) ||
        !own.moduleSuffixes.length ||
        own.moduleSuffixes.length > 8 ||
        own.moduleSuffixes.some(
          (value) =>
            typeof value !== "string" ||
            value.length > 64 ||
            /[\\/:\x00-\x1f]/u.test(value),
        )
      )
        return { reason: "unsupported_configuration" };
      settings.suffixes = own.moduleSuffixes;
    }
    if (own.customConditions !== undefined) {
      if (
        !Array.isArray(own.customConditions) ||
        own.customConditions.length > 16 ||
        own.customConditions.some(
          (value) => typeof value !== "string" || value.length > 128,
        )
      )
        return { reason: "unsupported_configuration" };
      settings.conditions = own.customConditions;
    }
    const result = { settings };
    context.configCache.set(path, result);
    return result;
  }
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function relativeValue(value) {
  return (
    typeof value === "string" &&
    value.length <= 2048 &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !/[\\:\x00-\x1f]/u.test(value)
  );
}
