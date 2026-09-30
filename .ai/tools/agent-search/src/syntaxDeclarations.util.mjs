/**
 * @file .ai/tools/agent-search/src/syntaxDeclarations.util.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Различает объявления и употребления имён в синтаксисе TS/JS.
 */
import ts from "typescript";

/** @returns {import('./SyntaxSearch.types.d.mts').SyntaxKind | undefined} */
export function getDeclarationKind(node) {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node))
    return "function";
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return "class";
  if (
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
    return "method";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node) || ts.isTypeParameterDeclaration(node))
    return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isModuleDeclaration(node)) return "namespace";
  if (ts.isVariableDeclaration(node) || ts.isBindingElement(node))
    return "variable";
  if (
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isEnumMember(node)
  )
    return "property";
  if (ts.isParameter(node)) return "parameter";
}

export const isDeclarationName = (node) => node.parent?.name === node;

/** Импорт/alias и JSX attribute — не использования символов; shorthand — использование. */
export function isExcludedReference(node) {
  if (
    ts.isJsxAttribute(node.parent) ||
    ts.isJsxClosingElement(node.parent) ||
    ts.isLabeledStatement(node.parent) ||
    ts.isBreakOrContinueStatement(node.parent)
  )
    return true;
  if (
    ts.isExportSpecifier(node.parent) &&
    node.parent.propertyName &&
    node.parent.name === node
  )
    return true;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxClosingElement(parent)) return true;
    if (ts.isImportDeclaration(parent) || ts.isImportEqualsDeclaration(parent))
      return true;
    if (ts.isStatement(parent) || ts.isSourceFile(parent)) break;
  }
  return false;
}
