/**
 * @file .ai/tools/engineering/src/prepareTsconfigMove.service.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Готовит exact/wildcard config effect по общему resolver и полной host-области consumers.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import type { SynchronousImportReadContext } from "../../agent-search/src/ImportResolution.types.d.mts";
import { loadImportConfigurationSync } from "../../agent-search/src/loadImportConfiguration.service.mjs";
import { resolveModulePathSync } from "../../agent-search/src/resolveModulePath.service.mjs";
import { styleModuleTarget } from "../../agent-search/src/styleModuleTarget.util.mjs";
import type {
  ArtifactMoveCandidate,
  SourceMoveResolverInput,
  SourceMoveConfigContext,
  ConfigTargetReplacement,
} from "./ProjectArtifactMove.types.ts";
import { mapMovedArtifactPath } from "./mapMovedArtifactPath.util.ts";
import { rewriteTsconfigPaths } from "./rewriteTsconfigPaths.util.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { resolveProjectArtifactKind } from "./resolveProjectArtifactKind.util.ts";
import { prepareWildcardTsconfigMove } from "./prepareWildcardTsconfigMove.service.ts";

/** Config bytes создаются в памяти; host/runtime отдельно проверяют native profile и write ACL. */
export function prepareTsconfigMove(
  input: SourceMoveResolverInput,
  before: SynchronousImportReadContext,
) {
  const candidates: ArtifactMoveCandidate[] = [];
  const targets = new Map<string, string>();
  const consumerContexts: SourceMoveConfigContext[] = [];
  const retainedPatterns = new Set<string>();
  const result = { candidates, targets, consumerContexts, retainedPatterns };
  const write = input.tsconfigWrite;
  if (!write) return result;
  if (
    !input.files.size ||
    [...input.files].some((path) => {
      const kind = resolveProjectArtifactKind(path);
      return kind === null || kind === "ai.template";
    })
  )
    unsupported();
  const consumerConfigs = new Set<string>();
  let baseUrl: string | undefined;
  let paths: Record<string, string[]> = {};
  const positions: SourceMoveConfigContext[] = [...input.files].flatMap(
    (path) => [
      { fromPath: path },
      { fromPath: mapMovedArtifactPath(path, input.from, input.to) },
    ],
  );
  for (const configPath of write.projectConfigPaths ?? [])
    positions.push({ fromPath: positions[0].fromPath, configPath });
  for (const position of positions) {
    const config = loadImportConfigurationSync(
      before,
      position.fromPath,
      position.configPath,
    );
    if (
      config.reason ||
      !config.configuration ||
      config.configuration.hasMultipleBases ||
      config.settings.pathsSourcePath !== write.path ||
      config.settings.baseUrl === undefined ||
      config.settings.paths === undefined
    )
      unsupported();
    // normalize сохраняет trailing slash: "./" и "." обозначают одно основание.
    const currentBaseUrl = posix.join(config.settings.baseUrl, ".");
    if (baseUrl !== undefined && baseUrl !== currentBaseUrl) unsupported();
    baseUrl = currentBaseUrl;
    paths = config.settings.paths;
    if (!consumerConfigs.has(config.configuration.path)) {
      consumerConfigs.add(config.configuration.path);
      consumerContexts.push(position);
    }
  }
  if (baseUrl === undefined) unsupported();
  const replacements = new Map<string, ConfigTargetReplacement>();
  for (const [alias, values] of Object.entries(paths)) {
    if (alias.includes("*")) continue;
    let originalTarget: string | undefined;
    for (const { fromPath, configPath } of consumerContexts) {
      const resolved = resolveModulePathSync(
        before,
        fromPath,
        alias,
        "import",
        "relocation",
        configPath,
      );
      if (
        resolved.reason ||
        !input.files.has(resolved.path) ||
        (originalTarget !== undefined && originalTarget !== resolved.path)
      )
        unsupported();
      originalTarget = resolved.path;
    }
    if (originalTarget === undefined) unsupported();
    const target = mapMovedArtifactPath(originalTarget, input.from, input.to);
    targets.set(alias, target);
    if (target === originalTarget) continue;
    let next = styleModuleTarget(posix.relative(baseUrl, target), values[0]);
    if (values[0].startsWith("./") && !next.startsWith(".")) next = "./" + next;
    replacements.set(alias, { previous: values[0], next });
  }
  const wildcard = prepareWildcardTsconfigMove(
    input,
    before,
    consumerContexts,
    { baseUrl, paths },
    targets,
  );
  for (const [alias, replacement] of wildcard.replacements) {
    replacements.set(alias, replacement);
    retainedPatterns.add(alias);
  }
  for (const [specifier, target] of wildcard.targets)
    targets.set(specifier, target);
  const original = input.readReference(write.path);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      original,
    );
  } catch {
    return unsupported();
  }
  const content = Buffer.from(
    rewriteTsconfigPaths(write.path, source, replacements),
    "utf8",
  );
  if (replacements.size)
    candidates.push({
      path: write.path,
      finalPath: write.path,
      kind: "config.tsconfig",
      original,
      content,
    });
  return result;
}

function unsupported(): never {
  throw new ProjectArtifactError(
    "UNSUPPORTED",
    "Config effect требует общего paths owner и нормализованного baseUrl, линейных config-цепочек, полной области consumers и одинаковых однозначных exact targets.",
  );
}
