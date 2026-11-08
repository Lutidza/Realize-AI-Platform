/**
 * @file .ai/tools/engineering/src/preparePackageExportsMove.service.ts
 * @version 1.0.1
 * @date 2026-10-30
 * @description Готовит один native package exports effect по общему каталогу и закрытой области consumers.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import type { SynchronousImportReadContext } from "../../agent-search/src/ImportResolution.types.d.mts";
import { readPackageExports } from "../../agent-search/src/readPackageExports.util.mjs";
import { loadImportConfigurationSync } from "../../agent-search/src/loadImportConfiguration.service.mjs";
import { resolveModulePathSync } from "../../agent-search/src/resolveModulePath.service.mjs";
import { styleModuleTarget } from "../../agent-search/src/styleModuleTarget.util.mjs";
import type {
  ArtifactMoveCandidate,
  ConfigTargetReplacement,
  SourceMoveConfigContext,
  SourceMoveResolverInput,
} from "./ProjectArtifactMove.types.ts";
import { mapMovedArtifactPath } from "./mapMovedArtifactPath.util.ts";
import { rewritePackageExports } from "./rewritePackageExports.util.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";

/** Host inventory фиксирует namespaces; parser, catalog и resolution остаются у agent-search. */
export function preparePackageExportsMove(
  input: SourceMoveResolverInput,
  before: SynchronousImportReadContext,
) {
  const candidates: ArtifactMoveCandidate[] = [],
    consumerContexts: SourceMoveConfigContext[] = [];
  const targets = new Map<string, string>(),
    result = { candidates, consumerContexts, targets };
  const write = input.packageExportsWrite;
  if (!write) return result;
  const root = posix.dirname(write.path);
  if (
    !input.workspaceDirectories ||
    !input.files.size ||
    ![input.from, input.to].every((path) => path.startsWith(root + "/"))
  )
    unsupported();
  // Адресные positive/negative probes сохраняют nested boundary без обхода остальных sources.
  const isFileMove = input.files.has(input.from);
  for (const candidate of [input.from, input.to])
    for (
      let directory = isFileMove ? posix.dirname(candidate) : candidate;
      directory !== root;
      directory = posix.dirname(directory)
    ) {
      const boundary = before.read(
        posix.join(directory, "package.json"),
        "config",
      );
      if (boundary.status !== "not_found") unsupported();
    }
  const owner = before.read(write.path, "config");
  if (owner.status !== "ok") unsupported();
  // Проверка native shape и duplicate keys выполняется тем же patch, включая пустой effect.
  rewritePackageExports(write.path, owner.text, new Map());
  const manifest = JSON.parse(owner.text.replace(/^\uFEFF/u, ""));
  const exact = readPackageExports(manifest.exports);
  if (exact.reason) unsupported();
  const contexts = new Set<string>();
  for (const path of input.files)
    for (const fromPath of [
      path,
      mapMovedArtifactPath(path, input.from, input.to),
    ]) {
      const config = loadImportConfigurationSync(before, fromPath);
      if (
        config.reason ||
        !config.configuration ||
        config.settings.legacy ||
        config.configuration.hasMultipleBases
      )
        unsupported();
      if (!contexts.has(config.configuration.path)) {
        contexts.add(config.configuration.path);
        consumerContexts.push({ fromPath });
      }
    }
  const replacements = new Map<string, ConfigTargetReplacement>();
  for (const [subpath, literal] of exact.targets) {
    const specifier = manifest.name + (subpath === "." ? "" : subpath.slice(1));
    let original: string | undefined;
    for (const { fromPath } of consumerContexts) {
      const resolved = resolveModulePathSync(
        before,
        fromPath,
        specifier,
        "import",
        "relocation-exports",
      );
      if (
        resolved.reason ||
        resolved.packageExport?.manifestPath !== write.path ||
        resolved.packageExport.subpath !== subpath ||
        resolved.packageExport.target !== literal ||
        !input.files.has(resolved.path) ||
        (original !== undefined && original !== resolved.path)
      )
        unsupported();
      original = resolved.path;
    }
    if (!original || !original.startsWith(root + "/")) unsupported();
    const target = mapMovedArtifactPath(original, input.from, input.to);
    targets.set(specifier, target);
    if (target !== original)
      replacements.set(subpath, {
        previous: literal,
        next: "./" + styleModuleTarget(posix.relative(root, target), literal),
      });
  }
  if (replacements.size)
    candidates.push({
      path: write.path,
      finalPath: write.path,
      kind: "config.package-exports",
      original: input.readReference(write.path),
      content: Buffer.from(
        rewritePackageExports(write.path, owner.text, replacements),
        "utf8",
      ),
    });
  return result;
}

function unsupported(): never {
  throw new ProjectArtifactError(
    "UNSUPPORTED",
    "Package exports effect требует одного workspace owner, полного source inventory и одинаковых exact targets во всех modern nearest configs.",
  );
}
