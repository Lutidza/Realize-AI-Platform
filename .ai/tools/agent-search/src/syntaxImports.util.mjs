/**
 * @file .ai/tools/agent-search/src/syntaxImports.util.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Находит статические import/re-export и literal dynamic import/require без resolution.
 */
import ts from "typescript";

export function findSyntaxImports(node, query, normalize) {
  const isImport = ts.isImportDeclaration(node);
  const isExport = ts.isExportDeclaration(node);
  const isEquals = ts.isImportEqualsDeclaration(node);
  const isType =
    ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument);
  const call =
    ts.isCallExpression(node) &&
    ((node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1) ||
      (node.arguments.length === 1 &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"));
  if (!isImport && !isExport && !isEquals && !isType && !call) return [];
  const specifierNode =
    isImport || isExport
      ? node.moduleSpecifier
      : isEquals && ts.isExternalModuleReference(node.moduleReference)
        ? node.moduleReference.expression
        : isType
          ? node.argument.literal
          : call
            ? node.arguments[0]
            : undefined;
  if (
    !specifierNode ||
    (!ts.isStringLiteral(specifierNode) &&
      !ts.isNoSubstitutionTemplateLiteral(specifierNode))
  )
    return [];
  const kind = isExport
    ? "export"
    : call
      ? node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? "dynamic_import"
        : "require"
      : "import";
  const moduleSpecifier =
    specifierNode.text.length <= 4096
      ? { moduleSpecifier: specifierNode.text }
      : {};
  const bindings = [];
  if (isEquals) bindings.push({ name: node.name });
  if (isImport && node.importClause) {
    if (node.importClause.name)
      bindings.push({ name: node.importClause.name, importedName: "default" });
    const named = node.importClause.namedBindings;
    if (named && ts.isNamespaceImport(named))
      bindings.push({ name: named.name, importedName: "*" });
    else if (named)
      for (const item of named.elements)
        bindings.push({
          name: item.name,
          original: item.propertyName,
          importedName: (item.propertyName ?? item.name).text,
        });
  }
  if (isExport && node.exportClause) {
    if (ts.isNamespaceExport(node.exportClause))
      bindings.push({ name: node.exportClause.name, importedName: "*" });
    else
      for (const item of node.exportClause.elements)
        bindings.push({
          name: item.name,
          original: item.propertyName,
          importedName: (item.propertyName ?? item.name).text,
        });
  }
  const matches = bindings.flatMap((binding) => {
    const matched =
      normalize(binding.name.text) === query
        ? binding.name
        : binding.original && normalize(binding.original.text) === query
          ? binding.original
          : undefined;
    if (!matched) return [];
    return [
      {
        node: matched,
        syntax: {
          kind,
          ...moduleSpecifier,
          ...(binding.name.text.length <= 512
            ? { name: binding.name.text }
            : {}),
          ...(binding.importedName?.length <= 512
            ? { importedName: binding.importedName }
            : {}),
        },
      },
    ];
  });
  return matches.length
    ? matches
    : query === "*" || normalize(specifierNode.text).includes(query)
      ? [{ node: specifierNode, syntax: { kind, ...moduleSpecifier } }]
      : [];
}
