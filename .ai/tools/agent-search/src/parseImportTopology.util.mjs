/**
 * @file .ai/tools/agent-search/src/parseImportTopology.util.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Извлекает module-level bindings и exports, сохраняя различие aliases и локальных объявлений.
 */
import ts from "typescript";
import { parseSyntaxSource } from "./parseSyntaxSource.util.mjs";
import { createSyntaxLocator } from "./createSyntaxLocator.util.mjs";
import { findSyntaxImports } from "./syntaxImports.util.mjs";
import { getDeclarationKind } from "./syntaxDeclarations.util.mjs";
import { IMPORT_RESOLUTION_LIMITS } from "./importResolution.config.mjs";

export function parseImportTopology(path, file, options) {
  const parsed = parseSyntaxSource(path, file.text);
  if (parsed.status !== "parsed") return { status: parsed.status };
  const source = parsed.source;
  const locate = createSyntaxLocator(file.text, source);
  const locals = new Map();
  const bindings = new Map();
  const exports = new Map();
  const stars = [];
  let entries = 0;
  let unsupportedExports = false;
  const add = (map, name, entry) => {
    entries++;
    if (entries > IMPORT_RESOLUTION_LIMITS.graphEntries) return;
    const values = map.get(name) ?? [];
    values.push(entry);
    map.set(name, values);
  };
  const has = (node, modifier) =>
    node.modifiers?.some((item) => item.kind === modifier);
  for (const statement of source.statements) {
    options.assertActive?.();
    if (entries > IMPORT_RESOLUTION_LIMITS.graphEntries)
      return { status: "scan_budget" };
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const clause = statement.importClause;
      const specifier = statement.moduleSpecifier.text;
      if (clause?.name)
        add(bindings, clause.name.text, {
          type: "forward",
          specifier,
          name: "default",
          node: clause.name,
          mode: "import",
        });
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named))
        add(bindings, named.name.text, {
          type: "module",
          specifier,
          node: named.name,
          mode: "import",
        });
      else if (named)
        for (const item of named.elements)
          add(bindings, item.name.text, {
            type: "forward",
            specifier,
            name: (item.propertyName ?? item.name).text,
            node: item.name,
            mode: "import",
          });
      continue;
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression &&
      ts.isStringLiteral(statement.moduleReference.expression)
    ) {
      add(bindings, statement.name.text, {
        type: "module",
        mode: "require",
        specifier: statement.moduleReference.expression.text,
        node: statement.name,
      });
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      const specifier =
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
      if (!statement.exportClause && specifier !== undefined) {
        stars.push({ specifier, node: statement.moduleSpecifier });
        entries++;
      } else if (
        statement.exportClause &&
        ts.isNamespaceExport(statement.exportClause)
      ) {
        if (specifier !== undefined)
          add(exports, statement.exportClause.name.text, {
            type: "module",
            specifier,
            mode: "import",
            node: statement.exportClause.name,
          });
      } else if (statement.exportClause) {
        for (const item of statement.exportClause.elements)
          add(exports, item.name.text, {
            type: specifier === undefined ? "local" : "forward",
            name: (item.propertyName ?? item.name).text,
            specifier,
            mode: "import",
            node: item.name,
          });
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals) unsupportedExports = true;
      else if (ts.isIdentifier(statement.expression))
        add(exports, "default", {
          type: "local",
          name: statement.expression.text,
          node: statement.expression,
        });
      else
        add(exports, "default", {
          type: "declaration",
          node: statement.expression,
          kind:
            ts.isArrowFunction(statement.expression) ||
            ts.isFunctionExpression(statement.expression)
              ? "function"
              : ts.isClassExpression(statement.expression)
                ? "class"
                : "variable",
          implementation: true,
        });
      continue;
    }
    if (
      ts.isExpressionStatement(statement) &&
      ts.isBinaryExpression(statement.expression) &&
      /^(?:module\s*\.\s*exports|exports\s*[.[])/u.test(
        statement.expression.left.getText(source),
      )
    )
      unsupportedExports = true;
    const declarations = ts.isVariableStatement(statement)
      ? [...statement.declarationList.declarations].flatMap((declaration) =>
          bindingNames(declaration.name).map((name) => ({
            node: name,
            name: name.text,
            kind: "variable",
            implementation: true,
          })),
        )
      : getDeclarationKind(statement) &&
          (statement.name || has(statement, ts.SyntaxKind.DefaultKeyword))
        ? [
            {
              node: statement.name ?? statement,
              name: statement.name?.text ?? "default",
              kind: getDeclarationKind(statement),
              implementation:
                !ts.isFunctionDeclaration(statement) || Boolean(statement.body),
            },
          ]
        : [];
    for (const declaration of declarations) {
      const entry = { type: "declaration", ...declaration };
      add(locals, declaration.name, entry);
      if (has(statement, ts.SyntaxKind.ExportKeyword))
        add(
          exports,
          has(statement, ts.SyntaxKind.DefaultKeyword)
            ? "default"
            : declaration.name,
          entry,
        );
    }
  }
  if (entries > IMPORT_RESOLUTION_LIMITS.graphEntries)
    return { status: "scan_budget" };
  return {
    status: "parsed",
    locals,
    bindings,
    exports,
    stars,
    unsupportedExports,
    matches,
    location,
  };

  function location(node, kind = "module", name) {
    const value = node ? locate(node) : { line: 1, character: 0, lineText: "" };
    const prefix = value.lineText.slice(0, value.character);
    return {
      path,
      line: value.line,
      column:
        (options.coordinateUnit === "utf8_bytes"
          ? Buffer.byteLength(prefix)
          : [...prefix].length) + 1,
      kind,
      ...(name !== undefined && name.length <= 512 ? { name } : {}),
      ...(file.sha256 ? { fileSha256: file.sha256 } : {}),
    };
  }

  function* matches(query, caseSensitive) {
    const normalize = (value) => (caseSensitive ? value : value.toLowerCase());
    const pending = [source];
    const bindings = [],
      modules = [];
    const maximum = IMPORT_RESOLUTION_LIMITS.matches + 1;
    let visited = 0;
    while (pending.length) {
      if (++visited % 256 === 0) options.assertActive?.();
      const node = pending.pop();
      for (const found of findSyntaxImports(
        node,
        normalize(query),
        normalize,
      )) {
        const selected =
          found.syntax.name !== undefined ||
          found.syntax.importedName !== undefined
            ? bindings
            : modules;
        if (selected.length >= maximum) continue;
        selected.push({
          ...locate(found.node),
          syntax: found.syntax,
          mode:
            found.syntax.kind === "require" ||
            ts.isImportEqualsDeclaration(node)
              ? "require"
              : "import",
        });
      }
      const children = [];
      ts.forEachChild(node, (child) => {
        children.push(child);
      });
      for (let index = children.length - 1; index >= 0; index--)
        pending.push(children[index]);
    }
    // Точный binding во всём seed приоритетнее случайного substring в имени другого модуля.
    // Отбор требует только уже созданный AST; зависимые файлы не читаются ради ранжирования.
    yield* bindings.length ? bindings : modules;
  }
}

function bindingNames(name) {
  const result = [];
  const pending = [name];
  while (pending.length) {
    const node = pending.pop();
    if (ts.isIdentifier(node)) result.push(node);
    else
      for (const element of node.elements ?? [])
        if (ts.isBindingElement(element)) pending.push(element.name);
  }
  return result;
}
