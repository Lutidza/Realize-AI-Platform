/**
 * @file .ai/tools/engineering/src/prepareWildcardTsconfigMove.service.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Готовит bounded wildcard directory targets и проверяет их members существующим agent-search.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import type {
  ImportConfigurationSettings,
  SynchronousImportReadContext,
} from "../../agent-search/src/ImportResolution.types.d.mts";
import { IMPORT_RESOLUTION_LIMITS } from "../../agent-search/src/importResolution.config.mjs";
import { findModuleAliasSpecifiers } from "../../agent-search/src/findModuleAliasSpecifiers.util.mjs";
import { selectModulePattern } from "../../agent-search/src/selectModulePattern.util.mjs";
import { resolveModulePathSync } from "../../agent-search/src/resolveModulePath.service.mjs";
import type {
  SourceMoveConfigContext,
  SourceMoveResolverInput,
  ConfigTargetReplacement,
} from "./ProjectArtifactMove.types.ts";
import { mapMovedArtifactPath } from "./mapMovedArtifactPath.util.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";

/** Policy выбирает целый root; inverse mapping, precedence и resolution принадлежат общему поиску. */
export function prepareWildcardTsconfigMove(
  input: SourceMoveResolverInput,
  before: SynchronousImportReadContext,
  contexts: readonly SourceMoveConfigContext[],
  settings: ImportConfigurationSettings & { baseUrl: string },
  exactTargets: ReadonlyMap<string, string>,
) {
  const replacements = new Map<string, ConfigTargetReplacement>();
  const targets = new Map(exactTargets);
  if (input.files.has(input.from)) return { replacements, targets };
  for (const [alias, values] of Object.entries(settings.paths ?? {})) {
    if (!alias.includes("*")) continue;
    // Только полный статический root может быть самостоятельным config effect.
    const affected = values.some((value) => {
      const prefix = value.split("*")[0];
      const root = posix.join(
        settings.baseUrl,
        posix.dirname(prefix + (prefix.endsWith("/") ? "_" : "")),
      );
      return mapMovedArtifactPath(root, input.from, input.to) !== root;
    });
    if (!affected) continue;
    if (
      values.length !== 1 ||
      !alias.endsWith("*") ||
      alias.split("*").length !== 2 ||
      !values[0].endsWith("/*") ||
      values[0].split("*").length !== 2
    )
      unsupported();
    const root = posix.join(settings.baseUrl, values[0].slice(0, -2));
    const finalRoot = mapMovedArtifactPath(root, input.from, input.to);
    const members = [...input.files].filter((path) =>
      path.startsWith(root + "/"),
    );
    if (root === finalRoot || !members.length) unsupported();
    let next = (posix.relative(settings.baseUrl, finalRoot) || ".") + "/*";
    if (values[0].startsWith("./") && !next.startsWith(".")) next = "./" + next;
    replacements.set(alias, { previous: values[0], next });
    for (const path of members) {
      const styles = [
        undefined,
        "module",
        path.endsWith("x") ? "module.jsx" : "module.js",
      ];
      for (const style of styles) {
        const candidates = findModuleAliasSpecifiers(
          { ...settings, paths: { [alias]: values } },
          path,
          style,
        );
        for (const specifier of candidates) {
          // Не подменяем exact/более специфичного владельца искусственно суженной map.
          if (
            selectModulePattern(settings.paths ?? {}, specifier, false)
              ?.pattern !== alias
          )
            continue;
          if (targets.has(specifier)) {
            if (
              targets.get(specifier) !==
              mapMovedArtifactPath(path, input.from, input.to)
            )
              unsupported();
            continue;
          }
          if (targets.size >= IMPORT_RESOLUTION_LIMITS.graphEntries)
            throw new ProjectArtifactError(
              "LIMIT_EXCEEDED",
              "Превышен бюджет wildcard proof specifiers.",
            );
          for (const { fromPath, configPath } of contexts) {
            const resolved = resolveModulePathSync(
              before,
              fromPath,
              specifier,
              "import",
              "relocation",
              configPath,
            );
            if (resolved.reason || resolved.path !== path) unsupported();
          }
          targets.set(
            specifier,
            mapMovedArtifactPath(path, input.from, input.to),
          );
        }
      }
    }
  }
  return { replacements, targets };
}

function unsupported(): never {
  throw new ProjectArtifactError(
    "UNSUPPORTED",
    "Wildcard config effect требует целого непустого directory/* root, одного target и однозначных достижимых members во всех contexts.",
  );
}
