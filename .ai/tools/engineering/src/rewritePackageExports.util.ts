/**
 * @file .ai/tools/engineering/src/rewritePackageExports.util.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Меняет только проверенные targets точных package exports, сохраняя остальные bytes JSON.
 * @see documentation/architecture/engineering-operations.md
 */
import ts from "typescript";
import { readPackageExports } from "../../agent-search/src/readPackageExports.util.mjs";
import { applyArtifactTextEdits } from "./applyArtifactTextEdits.util.ts";
import { readJsonProperties } from "./readJsonProperties.util.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import type {
  ArtifactTextEdit,
  ConfigTargetReplacement,
} from "./ProjectArtifactMove.types.ts";

/** Resolution принадлежит agent-search; этот patch отвечает за strict JSON и offsets. */
export function rewritePackageExports(
  path: string,
  source: string,
  replacements: ReadonlyMap<string, ConfigTargetReplacement>,
): string {
  let manifest: { exports?: unknown };
  try {
    manifest = JSON.parse(source.replace(/^\uFEFF/u, ""));
  } catch {
    return invalid();
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    invalid();
  const exact = readPackageExports(manifest.exports);
  if (exact.reason) invalid();
  const tree = ts.parseJsonText(path, source),
    statement = tree.statements[0];
  if (tree.statements.length !== 1 || !ts.isExpressionStatement(statement))
    invalid();
  const root = readJsonProperties(statement.expression),
    name = root.get("name");
  if (!name || !ts.isStringLiteral(name) || !name.text) invalid();
  const exports = root.get("exports");
  const nodes =
    exports && ts.isStringLiteral(exports)
      ? new Map([[".", exports]])
      : readJsonProperties(exports);
  const edits: ArtifactTextEdit[] = [];
  for (const [key, replacement] of replacements) {
    const node = nodes.get(key);
    if (
      !node ||
      !ts.isStringLiteral(node) ||
      node.text !== replacement.previous ||
      exact.targets.get(key) !== replacement.previous ||
      readPackageExports({ [key]: replacement.next }).reason
    )
      invalid();
    edits.push({
      start: node.getStart(tree),
      end: node.end,
      text: JSON.stringify(replacement.next),
    });
  }
  return applyArtifactTextEdits(source, edits);
}

function invalid(): never {
  throw new ProjectArtifactError(
    "UNSUPPORTED",
    "Package patch требует строгий JSON, name и однозначные exact exports targets.",
  );
}
