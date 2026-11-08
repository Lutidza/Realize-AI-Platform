/**
 * @file .ai/tools/engineering/src/rewriteTsconfigPaths.util.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Заменяет только проверенные строковые targets paths, сохраняя остальные bytes JSONC.
 * @see documentation/architecture/engineering-operations.md
 */
import ts from "typescript";
import { readJsonProperties } from "./readJsonProperties.util.ts";
import { applyArtifactTextEdits } from "./applyArtifactTextEdits.util.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import type {
  ArtifactTextEdit,
  ConfigTargetReplacement,
} from "./ProjectArtifactMove.types.ts";

/** AST задаёт только offsets native patch; module resolution остаётся у agent-search. */
export function rewriteTsconfigPaths(
  path: string,
  source: string,
  replacements: ReadonlyMap<string, ConfigTargetReplacement>,
): string {
  if (ts.parseConfigFileTextToJson(path, source).error) invalid();
  const tree = ts.parseJsonText(path, source);
  const statement = tree.statements[0];
  if (tree.statements.length !== 1 || !ts.isExpressionStatement(statement))
    invalid();
  const root = readJsonProperties(statement.expression);
  const options = readJsonProperties(root.get("compilerOptions"));
  // Семантику extends/baseUrl и origin проверяет shared resolver; здесь только native patch.
  const paths = readJsonProperties(options.get("paths"));
  const edits: ArtifactTextEdit[] = [];
  for (const [key, replacement] of replacements) {
    const value = paths.get(key);
    if (
      key.split("*").length > 2 ||
      !value ||
      !ts.isArrayLiteralExpression(value) ||
      value.elements.length !== 1
    )
      invalid();
    const target = value.elements[0];
    if (
      !ts.isStringLiteral(target) ||
      target.text !== replacement.previous ||
      target.text.split("*").length !== key.split("*").length ||
      replacement.next.split("*").length !== key.split("*").length
    )
      invalid();
    edits.push({
      start: target.getStart(tree),
      end: target.end,
      text: JSON.stringify(replacement.next),
    });
  }
  return applyArtifactTextEdits(source, edits);
}

function invalid(): never {
  throw new ProjectArtifactError(
    "UNSUPPORTED",
    "Config patch требует собственный paths без дублирующихся ключей и однозначные исходные targets.",
  );
}
