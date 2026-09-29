/**
 * @file .ai/tools/agent-search/src/resolveImportLinks.service.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Прослеживает ограниченные статические import/re-export цепочки с явными циклами и неоднозначностью.
 * @see documentation/architecture/repository-search.md
 */
import { createImportReadContext } from "./createImportReadContext.service.mjs";
import { parseImportTopology } from "./parseImportTopology.util.mjs";
import { resolveModulePath } from "./resolveModulePath.service.mjs";
import { createNavigationCoverage } from "./syntaxSearch.config.mjs";
import { IMPORT_RESOLUTION_LIMITS as limits } from "./importResolution.config.mjs";

/**
 * I/O, отмена и координаты принадлежат adapter; cache и footprint живут только этот вызов.
 * @param {string} fromPath
 * @param {import('./ImportResolution.types.d.mts').ImportResolutionOptions} options
 * @param {import('./ImportResolution.types.d.mts').ImportReadAdapter} adapter
 */
export async function resolveImportLinks(fromPath, options, adapter) {
  if (
    !Number.isInteger(options.maxDepth) ||
    options.maxDepth < 1 ||
    options.maxDepth > limits.maxDepth
  )
    throw new Error("Недопустимая глубина разрешения imports.");
  const context = createImportReadContext(adapter, options.assertActive);
  const navigation = createNavigationCoverage();
  const topologies = new Map();
  const matches = [];
  let matchLimitReached = false;
  const seed = await topology(fromPath);
  if (seed.graph) {
    for (const match of seed.graph.matches(
      options.query,
      options.caseSensitive,
    )) {
      context.assertActive();
      if (
        matches.length >=
        Math.min(options.maxMatches ?? limits.matches, limits.matches)
      ) {
        matchLimitReached = true;
        break;
      }
      const specifier = match.syntax.moduleSpecifier;
      const symbol = match.syntax.importedName;
      const resolution =
        specifier === undefined
          ? unresolved("unsupported_specifier")
          : await follow(
              fromPath,
              specifier,
              symbol,
              match.mode,
              [],
              new Set(),
            );
      const result = { ...match, resolution };
      options.onMatch?.();
      if (options.accept && !options.accept(result)) break;
      matches.push(result);
      if (context.stats.exhausted) break;
    }
  }
  navigation.skippedFiles += context.stats.excludedFiles;
  return {
    matches,
    navigation,
    seedReason: seed.reason ?? null,
    matchLimitReached,
    seedHash: seed.file?.sha256,
    snapshot: [...context.footprint.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
    resolution: {
      precision: "static_imports",
      maxDepth: options.maxDepth,
      maxFiles: limits.files,
      maxReadBytes: limits.bytes,
      filesRead: context.stats.filesRead,
      bytesRead: context.stats.bytesRead,
      probes: context.stats.probes,
      blockedCandidates: context.stats.blockedCandidates,
      unresolvedMatches: matches.filter(
        (match) => match.resolution.status === "unresolved",
      ).length,
      exhausted: context.stats.exhausted,
    },
  };

  async function topology(path) {
    if (topologies.has(path)) return topologies.get(path);
    const file = await context.read(path);
    if (file.status !== "ok") return { reason: file.status };
    const parsed = parseImportTopology(path, file, {
      ...options,
      assertActive: context.assertActive,
    });
    context.assertActive();
    let result;
    if (parsed.status === "parsed") {
      navigation.parsedFiles++;
      result = { graph: parsed, file };
    } else {
      if (parsed.status === "syntax_error") navigation.syntaxErrorFiles++;
      else if (parsed.status === "unsupported") navigation.unsupportedFiles++;
      else if (parsed.status === "scan_budget") context.stats.exhausted = true;
      else navigation.skippedFiles++;
      result = {
        reason:
          parsed.status === "unsupported"
            ? "unsupported_language"
            : parsed.status === "size"
              ? "file_too_large"
              : parsed.status,
        file,
      };
    }
    topologies.set(path, result);
    return result;
  }

  async function follow(path, specifier, symbol, mode, chain, visited) {
    context.assertActive();
    if (chain.length >= options.maxDepth) return unresolved("max_depth", chain);
    const target = await resolveModulePath(context, path, specifier, mode);
    if (target.reason) return unresolved(target.reason, chain);
    if (!symbol || symbol === "*") {
      return resolved(
        {
          path: target.path,
          line: 1,
          column: 1,
          kind: "module",
          ...(target.file.sha256 ? { fileSha256: target.file.sha256 } : {}),
        },
        chain,
      );
    }
    return exported(target.path, symbol, chain, visited);
  }

  async function exported(path, name, chain, visited) {
    context.assertActive();
    const key = `${path}\u0000${name}`;
    if (visited.has(key)) return unresolved("cycle", chain);
    const next = new Set([...visited, key]);
    const loaded = await topology(path);
    if (!loaded.graph) return unresolved(loaded.reason, chain);
    const graph = loaded.graph;
    const direct = graph.exports.get(name);
    if (direct) return entries(path, name, direct, graph, chain, next);
    if (name === "default" || !graph.stars.length)
      return unresolved(
        graph.unsupportedExports ? "unsupported_export" : "symbol_not_exported",
        chain,
      );
    const candidates = [];
    for (const star of graph.stars) {
      const step = graph.location(star.node, "export", name);
      if (chain.length >= options.maxDepth)
        return unresolved("max_depth", chain);
      const result = await follow(
        path,
        star.specifier,
        name,
        "import",
        [...chain, step],
        next,
      );
      if (result.reason === "symbol_not_exported") continue;
      // Неизвестная ветвь может экспортировать другое имя: первый успех не доказывает уникальность.
      if (result.status !== "resolved") return result;
      candidates.push(result);
    }
    return unique(candidates, chain);
  }

  async function entries(path, name, values, graph, chain, visited) {
    if (values.every((value) => value.type === "declaration")) {
      const implementations = values.filter((value) => value.implementation);
      const selected = implementations.length ? implementations : values;
      return unique(
        selected.map((value) =>
          resolved(graph.location(value.node, value.kind, name), chain),
        ),
        chain,
      );
    }
    if (values.length !== 1) return unresolved("ambiguous", chain);
    const entry = values[0];
    if (chain.length >= options.maxDepth) return unresolved("max_depth", chain);
    const nextChain = [...chain, graph.location(entry.node, "export", name)];
    if (entry.type === "forward" || entry.type === "module")
      return follow(
        path,
        entry.specifier,
        entry.type === "module" ? "*" : entry.name,
        entry.mode,
        nextChain,
        visited,
      );
    const locals = graph.locals.get(entry.name);
    if (locals)
      return entries(path, entry.name, locals, graph, nextChain, visited);
    const bindings = graph.bindings.get(entry.name);
    if (bindings)
      return entries(path, entry.name, bindings, graph, nextChain, visited);
    return unresolved("symbol_not_exported", nextChain);
  }
}

function unique(results, chain) {
  const targets = new Map();
  for (const result of results)
    targets.set(
      `${result.target.path}:${result.target.line}:${result.target.column}`,
      result,
    );
  return targets.size === 1
    ? [...targets.values()][0]
    : unresolved(targets.size ? "ambiguous" : "symbol_not_exported", chain);
}
function resolved(target, chain) {
  return { status: "resolved", reason: null, target, chain };
}
function unresolved(reason, chain = []) {
  return { status: "unresolved", reason, target: null, chain };
}
