/**
 * @file .ai/tools/engineering/src/validateSourceArtifact.validator.ts
 * @version 1.2.0
 * @date 2026-10-30
 * @description Проверяет native header, профиль символа, grammar и execution boundary TS/JS/JSX без выполнения исходника.
 * @see documentation/architecture/engineering-artifacts.md
 */
import { posix } from "node:path";
import ts from "typescript";
import { validateSourceHeader } from "../../source-headers/src/validateSourceHeader.validator.ts";
import { readLeadingComments } from "../../source-headers/src/readLeadingComments.util.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { parseSyntaxSource } from "../../agent-search/src/parseSyntaxSource.util.mjs";
import { resolveProjectArtifactKind } from "./resolveProjectArtifactKind.util.ts";
import type { EffectiveFolderPolicy } from "./ProjectArtifactBinding.types.ts";

/** Syntax evidence не доказывает type safety, чистоту функции или семантический review. */
export function validateSourceArtifact(
  path: string,
  source: string,
  boundary: EffectiveFolderPolicy["executionBoundary"] = null,
): string[] {
  const kind = resolveProjectArtifactKind(path);
  if (
    kind === null ||
    kind === "ai.template" ||
    !/^(?:src\/|packages\/[^/]+\/src\/|services\/[^/]+\/src\/|\.ai\/tools\/[^/]+\/)/.test(
      path,
    ) ||
    (kind === "source.component" &&
      !/^(?:src\/|packages\/[^/]+\/src\/)/.test(path))
  )
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Source требует зарегистрированного profile и подходящего source owner.",
    );
  const name = posix.basename(path).split(".")[0];
  const pattern =
    kind === "source.component" || kind === "source.types"
      ? /^[A-Z][A-Za-z0-9]*$/
      : kind === "source.adapter"
        ? /^[A-Za-z][A-Za-z0-9]*$/
        : /^[a-z][A-Za-z0-9]*$/;
  if (!pattern.test(name) || posix.basename(path).split(".").length !== 3)
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Имя не соответствует registered source profile.",
    );
  if (validateSourceHeader(source, path, "tsdoc").length)
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Source header не соответствует native profile.",
    );
  const compiled = ts.transpileModule(source, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: path.endsWith(".cts")
        ? ts.ModuleKind.CommonJS
        : ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      allowJs: true,
    },
  });
  if (
    compiled.diagnostics?.some(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    )
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Source содержит ошибку grammar своего TS/JS/JSX формата.",
    );
  const parsed = parseSyntaxSource(path, source);
  if (parsed.status !== "parsed")
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Общий parser не подтвердил syntax исходника.",
    );
  const tree = parsed.source;
  if (
    path.endsWith(".cjs") &&
    tree.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) ||
        ts.isImportEqualsDeclaration(statement) ||
        ts.isExportDeclaration(statement) ||
        ts.isExportAssignment(statement) ||
        (ts.canHaveModifiers(statement) &&
          ts
            .getModifiers(statement)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)),
    )
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "CJS source не допускает статические ESM declarations.",
    );
  if (/\.(?:cjs|cts)$/.test(path)) {
    const moduleGrammar = (node: ts.Node, inFunction = false) => {
      if (
        (ts.isMetaProperty(node) &&
          node.keywordToken === ts.SyntaxKind.ImportKeyword) ||
        (!inFunction &&
          (ts.isAwaitExpression(node) ||
            (ts.isForOfStatement(node) && node.awaitModifier)))
      )
        throw new ProjectArtifactError(
          "INVALID_INPUT",
          "CommonJS source не допускает import.meta или top-level await.",
        );
      ts.forEachChild(node, (child) =>
        moduleGrammar(child, inFunction || ts.isFunctionLike(node)),
      );
    };
    moduleGrammar(tree);
  }
  const hasFunction = tree.statements.some(
    (statement) =>
      (ts.isFunctionDeclaration(statement) &&
        statement.name?.text === name &&
        !!statement.body) ||
      (ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === name &&
            !!declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer)),
        )),
  );
  const hasClass =
    kind === "source.adapter" &&
    /^[A-Z]/.test(name) &&
    tree.statements.some(
      (statement) =>
        ts.isClassDeclaration(statement) &&
        statement.name?.text === `${name}Adapter` &&
        !statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword,
        ),
    );
  if (kind === "source.types") {
    const typeOnly = (statement: ts.Statement) =>
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      (ts.isImportDeclaration(statement) &&
        !!statement.importClause &&
        (statement.importClause.isTypeOnly ||
          (!statement.importClause.name &&
            !!statement.importClause.namedBindings &&
            ts.isNamedImports(statement.importClause.namedBindings) &&
            statement.importClause.namedBindings.elements.length > 0 &&
            statement.importClause.namedBindings.elements.every(
              (binding) => binding.isTypeOnly,
            )))) ||
      (ts.isExportDeclaration(statement) &&
        (statement.isTypeOnly ||
          (!!statement.exportClause &&
            ts.isNamedExports(statement.exportClause) &&
            statement.exportClause.elements.length > 0 &&
            statement.exportClause.elements.every(
              (binding) => binding.isTypeOnly,
            ))));
    if (!tree.statements.length || !tree.statements.every(typeOnly))
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "source.types допускает только type/interface и type-only imports/exports.",
      );
  } else if (!(
    hasClass ||
    (hasFunction && (kind === "source.component" || /^[a-z]/.test(name)))
  ))
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Source должен содержать реализацию основного символа своего profile.",
    );
  if (
    kind !== "source.util" &&
    kind !== "source.types" &&
    tree.statements.some(
      (statement) =>
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement),
    )
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Собственные props/контракты должны находиться в source.types.",
    );
  const directives = new Set<string>();
  let prologue = true;
  for (const statement of tree.statements) {
    const literal =
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
        ? statement.expression.text
        : null;
    if (literal === null) prologue = false;
    if (literal !== "use client" && literal !== "use server") continue;
    if (!prologue)
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Execution directive должна находиться в prologue.",
      );
    directives.add(literal);
  }
  if (
    directives.size > 1 ||
    (boundary === "server" && directives.has("use client")) ||
    (boundary === "client" && directives.has("use server"))
  )
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Source directives противоречат execution boundary.",
    );
  const comments = readLeadingComments(source, "tsdoc");
  if (comments.some((comment) => /(?:^|\n)\s*\*?\s*@docref\b/.test(comment)))
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "@docref требует зарегистрированного resolver идентификаторов документации.",
    );
  const refs = comments.flatMap((comment) =>
    [...comment.matchAll(/(?:^|\n)\s*\*?\s*@see\s+([^\r\n]+)/g)].map((match) =>
      match[1].trim(),
    ),
  );
  if (refs.some((ref) => !/^documentation\/.+\.md(?:#[^\s#]+)?$/.test(ref)))
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "@see должен ссылаться на существующий documentation Markdown.",
    );
  return refs;
}
