/**
 * @file .ai/tools/agent-search/src/readSyntaxModuleReference.util.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Выделяет module expression из AST, включая формы, требующие явного отказа при изменении кода.
 * @see documentation/architecture/repository-search.md
 */
import ts from "typescript";

/** Возвращает исходный node с UTF-16 offsets; computed expression не выдаётся за literal. */
export function readSyntaxModuleReference(node) {
  if (ts.isImportDeclaration(node))
    return { kind: "import", form: "import", specifier: node.moduleSpecifier };
  if (ts.isExportDeclaration(node) && node.moduleSpecifier)
    return { kind: "export", form: "export", specifier: node.moduleSpecifier };
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference)
  )
    return {
      kind: "import",
      form: "import_equals",
      specifier: node.moduleReference.expression,
    };
  if (ts.isImportTypeNode(node))
    return {
      kind: "import",
      form: "import_type",
      specifier: ts.isLiteralTypeNode(node.argument)
        ? node.argument.literal
        : undefined,
    };
  if (!ts.isCallExpression(node)) return undefined;
  const expression = node.expression;
  if (expression.kind === ts.SyntaxKind.ImportKeyword)
    return {
      kind: "dynamic_import",
      form: "dynamic_import",
      specifier: node.arguments[0],
      argumentCount: node.arguments.length,
    };
  if (ts.isIdentifier(expression) && expression.text === "require")
    return {
      kind: "require",
      form: "require",
      specifier: node.arguments[0],
      argumentCount: node.arguments.length,
    };
  if (
    ts.isPropertyAccessExpression(expression) &&
    (expression.name.text === "require" ||
      (expression.name.text === "resolve" &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === "require"))
  )
    return {
      kind: "require",
      form: "require_property",
      specifier: node.arguments[0],
      argumentCount: node.arguments.length,
    };
  return undefined;
}
