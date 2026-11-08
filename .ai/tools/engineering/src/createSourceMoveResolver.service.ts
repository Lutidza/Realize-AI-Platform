/**
 * @file .ai/tools/engineering/src/createSourceMoveResolver.service.ts
 * @version 1.2.0
 * @date 2026-11-02
 * @description Подключает полный move inventory к общему resolver и проверяет ссылки в виртуальном результате.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import { createImportReadContextSync } from "../../agent-search/src/createImportReadContext.service.mjs";
import { loadImportConfigurationSync } from "../../agent-search/src/loadImportConfiguration.service.mjs";
import { resolveModulePathSync } from "../../agent-search/src/resolveModulePath.service.mjs";
import { findModuleAliasSpecifiers } from "../../agent-search/src/findModuleAliasSpecifiers.util.mjs";
import { styleModuleTarget } from "../../agent-search/src/styleModuleTarget.util.mjs";
import { selectModulePattern } from "../../agent-search/src/selectModulePattern.util.mjs";
import type { SourceMoveResolverInput } from "./ProjectArtifactMove.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { mapMovedArtifactPath } from "./mapMovedArtifactPath.util.ts";
import { assertProjectMoveMembership } from "./assertProjectMoveMembership.service.ts";
import { prepareTsconfigMove } from "./prepareTsconfigMove.service.ts";
import { preparePackageExportsMove } from "./preparePackageExportsMove.service.ts";

/** Config write требует отдельной host policy; grant чтения не превращается в запись. */
export function createSourceMoveResolver(input: SourceMoveResolverInput) {
  const resolutionPolicy = input.packageExportsWrite
    ? "relocation-exports"
    : "relocation";
  const configOverrides = new Map<string, Uint8Array>();
  const finalPaths = new Map(
    [...input.files].map((path) => [
      mapMovedArtifactPath(path, input.from, input.to),
      path,
    ]),
  );
  const createContext = (final: boolean) =>
    createImportReadContextSync({
      isAllowed: (path, purpose) =>
        purpose === "config"
          ? path.endsWith(".json") &&
            (!input.packageExportsWrite ||
              !path.endsWith("/package.json") ||
              input.packageExportsWrite.workspaceRoots.some((root) =>
                path.startsWith(root + "/"),
              ))
          : !path.endsWith(".json") &&
            input.referenceRoots.some((root) => path.startsWith(root + "/")),
      read(path, options) {
        input.readPaths.add(path);
        const actual = final
          ? finalPaths.get(path)
          : input.files.has(path)
            ? path
            : undefined;
        // Полный inventory доказывает отсутствие source. Config проверяет защищённый host reader.
        if (!actual && !path.endsWith(".json")) return { status: "not_found" };
        let bytes: Uint8Array;
        try {
          bytes =
            (final ? configOverrides.get(path) : undefined) ??
            input.readReference(actual ?? path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return { status: "not_found" };
          throw error;
        }
        if (bytes.byteLength > options.maximumBytes)
          return { status: "file_too_large" };
        options.onReadBytes(bytes.byteLength);
        try {
          return {
            status: "ok",
            text: new TextDecoder("utf-8", {
              fatal: true,
              ignoreBOM: true,
            }).decode(bytes),
          };
        } catch {
          return unsupported("Reference не является UTF-8 исходником.");
        }
      },
      listDirectories(path, limit) {
        if (
          !input.packageExportsWrite ||
          !input.workspaceDirectories ||
          !input.packageExportsWrite.workspaceRoots.some(
            (root) => path === root || path.startsWith(root + "/"),
          )
        )
          return { status: "forbidden" };
        // Native port фиксирует shallow namespace; parser и каталог остаются у общего resolver.
        const directories = input.workspaceDirectories(path, limit);
        if (directories === null) return { status: "not_found" };
        return directories.length > limit
          ? { status: "scan_budget" }
          : { status: "ok", directories: [...directories] };
      },
    });
  const before = createContext(false);
  const configuration = prepareTsconfigMove(input, before);
  const packages = preparePackageExportsMove(input, before);
  const configEdits = [...configuration.candidates, ...packages.candidates];
  for (const candidate of configEdits)
    configOverrides.set(candidate.path, candidate.content);
  const after = createContext(true);
  assertProjectMoveMembership(input, before, after, new Set(finalPaths.keys()));
  // Union original/final контекстов сохраняет проверку обеих сторон перехода между configs.
  for (const prepared of [configuration, packages])
    for (const { fromPath, configPath } of prepared.consumerContexts)
      for (const [alias, target] of prepared.targets) {
        const resolved = resolveModulePathSync(
          after,
          fromPath,
          alias,
          "import",
          resolutionPolicy,
          configPath,
        );
        if (
          resolved.reason ||
          resolved.path !== target ||
          (prepared === packages &&
            resolved.packageExport?.manifestPath !==
              input.packageExportsWrite?.path)
        )
          unsupported("Config effect не сохраняет проверенную цель alias.");
      }
  const resolveInContext = (
    path: string,
    finalPath: string,
    specifier: string,
    configPath?: string,
    mode: "import" | "require" = "import",
  ) => {
    const original = resolveModulePathSync(
      before,
      path,
      specifier,
      mode,
      resolutionPolicy,
      configPath,
    );
    if (original.reason)
      return unsupported(`Исходный module reference: ${original.reason}.`);
    const target = mapMovedArtifactPath(original.path, input.from, input.to);
    const result = (replacement: string) => ({
      replacement,
      original: original.path,
      target,
    });
    if (!specifier.startsWith(".")) {
      const config = loadImportConfigurationSync(before, path, configPath);
      if (config.reason)
        return unsupported(`Исходная config: ${config.reason}.`);
      const mapping = selectModulePattern(
        config.settings.paths ?? {},
        specifier,
        false,
      );
      if (input.packageExportsWrite && (original.packageExport || !mapping)) {
        const retained = resolveModulePathSync(
          after,
          finalPath,
          specifier,
          mode,
          resolutionPolicy,
          configPath,
        );
        if (
          !original.packageExport ||
          retained.reason ||
          !retained.packageExport ||
          retained.packageExport.manifestPath !==
            original.packageExport.manifestPath ||
          retained.packageExport.subpath !== original.packageExport.subpath ||
          retained.path !== target
        )
          return unsupported(
            "Package reference требует сохранённого exact export и ожидаемой цели.",
          );
        return result(specifier);
      }
      if (
        mapping &&
        (!mapping.pattern.includes("*") ||
          configuration.retainedPatterns.has(mapping.pattern))
      ) {
        const retained = resolveModulePathSync(
          after,
          finalPath,
          specifier,
          mode,
          resolutionPolicy,
          configPath,
        );
        if (retained.reason || retained.path !== target)
          return unsupported(
            "Alias требует разрешённого config effect и сохранения identity.",
          );
        return result(specifier);
      }
    }
    if (path === finalPath && target === original.path) {
      const unchanged = resolveModulePathSync(
        after,
        finalPath,
        specifier,
        mode,
        resolutionPolicy,
        configPath,
      );
      if (unchanged.reason || unchanged.path !== target)
        return unsupported("Неизменённый reference потерял исходную цель.");
      return result(specifier);
    }
    const styledTarget = styleModuleTarget(target, specifier);
    let replacement: string;
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      replacement = posix.relative(posix.dirname(finalPath), styledTarget);
      if (!replacement.startsWith(".")) replacement = "./" + replacement;
    } else {
      const config = loadImportConfigurationSync(after, finalPath, configPath);
      if (config.reason)
        return unsupported(`Финальная config: ${config.reason}.`);
      const originalConfig = loadImportConfigurationSync(
        before,
        path,
        configPath,
      );
      if (originalConfig.reason)
        return unsupported(`Исходная config: ${originalConfig.reason}.`);
      const previous = selectModulePattern(
        originalConfig.settings.paths ?? {},
        specifier,
        false,
      );
      const values = previous && config.settings.paths?.[previous.pattern];
      // При wildcard config effect сохраняем прежний alias; остальные планы требуют уникального inverse.
      const preferred =
        configuration.retainedPatterns.size && previous && values
          ? findModuleAliasSpecifiers(
              { ...config.settings, paths: { [previous.pattern]: values } },
              target,
              specifier,
            ).filter(
              (candidate) =>
                selectModulePattern(
                  config.settings.paths ?? {},
                  candidate,
                  false,
                )?.pattern === previous.pattern,
            )
          : [];
      const matches = preferred.length
        ? preferred
        : findModuleAliasSpecifiers(config.settings, target, specifier);
      if (matches.length !== 1)
        return unsupported("Alias не имеет единственного обратного mapping.");
      replacement = matches[0];
    }
    const resolved = resolveModulePathSync(
      after,
      finalPath,
      replacement,
      mode,
      resolutionPolicy,
      configPath,
    );
    if (resolved.reason || resolved.path !== target)
      return unsupported("Финальный reference не подтверждает ожидаемую цель.");
    return result(replacement);
  };
  const resolveReference = (
    path: string,
    finalPath: string,
    specifier: string,
    mode: "import" | "require" = "import",
  ): string => {
    const nearest = resolveInContext(
      path,
      finalPath,
      specifier,
      undefined,
      mode,
    );
    // Верхняя оценка consumers включает транзитивные imports вне root selectors.
    for (const configPath of input.tsconfigWrite?.projectConfigPaths ?? []) {
      const explicit = resolveInContext(
        path,
        finalPath,
        specifier,
        configPath,
        mode,
      );
      if (
        explicit.original !== nearest.original ||
        explicit.target !== nearest.target ||
        explicit.replacement !== nearest.replacement
      )
        unsupported("Project contexts не согласовали цель и замену reference.");
    }
    return nearest.replacement;
  };
  return { resolveReference, configEdits };
}

function unsupported(message: string): never {
  throw new ProjectArtifactError("UNSUPPORTED", message);
}
