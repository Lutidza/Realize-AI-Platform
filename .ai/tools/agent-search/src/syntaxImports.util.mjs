/**
 * @file .ai/tools/agent-search/src/syntaxImports.util.mjs
 * @version 1.0.1
 * @date 2026-10-29
 * @description Находит статические import/re-export и literal dynamic import/require без resolution.
 */
import ts from "typescript";
import { readSyntaxModuleReference } from "./readSyntaxModuleReference.util.mjs";

export function findSyntaxImports(node, query, normalize) {
  const reference = readSyntaxModuleReference(node);
  if (
    !reference ||
    reference.form === "require_property" ||
    (reference.form === "require" && reference.argumentCount !== 1)
  )
    return [];
  const specifierNode = reference.specifier;
  if (
    !specifierNode ||
    (!ts.isStringLiteral(specifierNode) &&
      !ts.isNoSubstitutionTemplateLiteral(specifierNode))
  )
    return [];
  const isImport = reference.form === "import";
  const isExport = reference.form === "export";
  const isEquals = reference.form === "import_equals";
  const kind = reference.kind;
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
