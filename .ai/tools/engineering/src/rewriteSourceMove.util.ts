/**
 * @file .ai/tools/engineering/src/rewriteSourceMove.util.ts
 * @version 1.3.0
 * @date 2026-10-30
 * @description Пересчитывает однозначные TypeScript references и native шапку без перепечатывания исходника.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import ts from "typescript";
import { parseSyntaxSource } from "../../agent-search/src/parseSyntaxSource.util.mjs";
import { readSyntaxModuleReference } from "../../agent-search/src/readSyntaxModuleReference.util.mjs";
import type {
  SourceMoveTextInput,
  ArtifactTextEdit,
} from "./ProjectArtifactMove.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { applyArtifactTextEdits } from "./applyArtifactTextEdits.util.ts";

export function rewriteSourceMove(input: SourceMoveTextInput): string {
  const { path, finalPath, source, changedOn } = input;
  if (posix.basename(path) !== posix.basename(finalPath))
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Source move сохраняет basename и имя функции.",
    );
  const parsed = parseSyntaxSource(path, source);
  if (parsed.status !== "parsed")
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Общий parser не подтвердил полный syntax исходника.",
    );
  const tree = parsed.source;
  const commonJs = /\.(?:cjs|cts)$/.test(path);
  const edits: ArtifactTextEdit[] = [],
    modules = new Set<ts.Node>();
  const unsupported = () => {
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Reference требует отдельного semantic resolver.",
    );
  };
  const moduleReference = (node: ts.Node, mode: "import" | "require") => {
    if (!ts.isStringLiteral(node)) return unsupported();
    modules.add(node);
    const specifier = node.text;
    if (specifier.startsWith("node:")) return;
    const replacement = input.resolveReference(
      path,
      finalPath,
      specifier,
      mode,
    );
    if (replacement === specifier) return;
    const quote = node.getText(tree)[0];
    const escaped = JSON.stringify(replacement).slice(1, -1);
    edits.push({
      start: node.getStart(tree) + 1,
      end: node.end - 1,
      text: quote === "'" ? escaped.replaceAll("'", "\\'") : escaped,
    });
  };
  const visit = (node: ts.Node) => {
    // Динамическая область может подменить даже синтаксически прямой require.
    if (
      commonJs &&
      (ts.isWithStatement(node) ||
        (ts.isIdentifier(node) && node.text === "eval"))
    )
      unsupported();
    // Консервативно исключает shadowing/alias/reassignment без отдельного semantic resolver.
    if (
      commonJs &&
      ts.isIdentifier(node) &&
      node.text === "require" &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    )
      unsupported();
    const reference = readSyntaxModuleReference(node);
    if (reference) {
      if (
        (reference.kind === "require" &&
          (!commonJs ||
            reference.form !== "require" ||
            reference.argumentCount !== 1 ||
            (ts.isCallExpression(node) &&
              (!!node.questionDotToken || !!node.typeArguments?.length)))) ||
        (reference.form === "import_equals" && !path.endsWith(".cts")) ||
        (reference.form === "dynamic_import" &&
          reference.argumentCount !== 1) ||
        !reference.specifier
      )
        unsupported();
      const mode =
        reference.kind === "require" ||
        reference.form === "import_equals" ||
        path.endsWith(".cts")
          ? "require"
          : "import";
      moduleReference(reference.specifier!, mode);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const checkStrings = (node: ts.Node) => {
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateExpression(node)) &&
      !modules.has(node)
    ) {
      const value = ts.isTemplateExpression(node)
        ? node.getText(tree)
        : node.text;
      if (
        (value.includes("/") || value.includes("\\")) &&
        !/^[a-z][a-z\d+.-]*:\/\//i.test(value)
      )
        unsupported();
    }
    ts.forEachChild(node, checkStrings);
  };
  checkStrings(tree);
  let result = applyArtifactTextEdits(source, edits);
  if (path !== finalPath || result !== source) {
    result = result.replace(
      /^(\s*\*\s*@file\s+)[^\r\n]+/m,
      (_, prefix) => prefix + finalPath,
    );
    result = result.replace(
      /^(\s*\*\s*@version\s+)(\d+)\.(\d+)\.(\d+)[ \t]*(?=\r?$)/m,
      (_, prefix, major, minor, patch) => {
        const next = Number(patch) + 1;
        if (!Number.isSafeInteger(next)) return unsupported();
        return `${prefix}${major}.${minor}.${next}`;
      },
    );
    result = result.replace(
      /^(\s*\*\s*@date\s+)[^\r\n]+/m,
      (_, prefix) => prefix + changedOn,
    );
  }
  return result;
}
