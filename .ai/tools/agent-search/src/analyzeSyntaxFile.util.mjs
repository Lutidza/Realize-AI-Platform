/**
 * @file .ai/tools/agent-search/src/analyzeSyntaxFile.util.mjs
 * @version 1.0.1
 * @date 2026-09-28
 * @description Разбирает только переданный TS/JS текст; не читает зависимости и не связывает символы.
 * @see documentation/architecture/repository-search.md
 */
import ts from "typescript";
import {
  SYNTAX_MAX_FILE_BYTES,
  isSyntaxSearchFile,
} from "./syntaxSearch.config.mjs";
import {
  getDeclarationKind,
  isDeclarationName,
  isExcludedReference,
} from "./syntaxDeclarations.util.mjs";
import { findSyntaxImports } from "./syntaxImports.util.mjs";
import { parseSyntaxSource } from "./parseSyntaxSource.util.mjs";
import { createSyntaxLocator } from "./createSyntaxLocator.util.mjs";

/**
 * Ошибочный syntax не выдаётся за достоверную структуру. Offsets/character — UTF-16;
 * transport adapters переводят их в документированные координаты CLI/MCP.
 * @param {string} fileName
 * @param {string} text
 * @param {import('./SyntaxSearch.types.d.mts').SyntaxSearchOptions} options
 */
export function analyzeSyntaxFile(fileName, text, options) {
  if (!isSyntaxSearchFile(fileName))
    return { status: "unsupported", matches: [] };
  if (Buffer.byteLength(text) > SYNTAX_MAX_FILE_BYTES)
    return { status: "size", matches: [] };
  const normalize = (value) =>
    options.caseSensitive ? value : value.toLowerCase();
  const query = normalize(options.query);
  // Unicode lowercasing зависит от контекста (например, греческая конечная sigma):
  // у целого файла и отдельного имени он различается. Для caseless non-ASCII query
  // prefilter отключён; escapes также требуют AST (Unicode/hex имена и строки).
  // Числовое имя AST нормализовано (0xff → 255, 1_000 → 1000, 1e999 → Infinity).
  const numericName =
    options.intent === "definitions" && /^(?:[0-9]|infinity$)/iu.test(query);
  const canPrefilter =
    !numericName &&
    (options.caseSensitive || /^\p{ASCII}*$/u.test(options.query));
  if (
    canPrefilter &&
    !(options.intent === "imports" && query === "*") &&
    !normalize(text).includes(query) &&
    !text.includes("\\")
  )
    return { status: "prefiltered", matches: [] };
  const parsed = parseSyntaxSource(fileName, text);
  if (parsed.status !== "parsed") return { status: parsed.status, matches: [] };
  const source = parsed.source;
  const locate = createSyntaxLocator(text, source);
  const matchAt = (node, syntax) => ({ ...locate(node), syntax });
  return { status: "parsed", matches: iterate() };
  /** @returns {Generator<import('./SyntaxSearch.types.d.mts').SyntaxMatch>} */
  function* iterate() {
    // Итеративный обход не добавляет собственную рекурсию поверх пользовательского AST.
    const pending = [source];
    let visited = 0;
    while (pending.length) {
      if (++visited % 256 === 0) options.assertActive?.();
      const node = pending.pop();
      if (options.intent === "imports") {
        for (const match of findSyntaxImports(node, query, normalize))
          yield matchAt(match.node, match.syntax);
      } else if (
        ts.isIdentifier(node) ||
        ts.isPrivateIdentifier(node) ||
        ts.isStringLiteral(node) ||
        ts.isNumericLiteral(node)
      ) {
        if (normalize(node.text) === query) {
          const declaration =
            isDeclarationName(node) && getDeclarationKind(node.parent);
          if (options.intent === "definitions" && declaration)
            yield matchAt(node, { kind: declaration, name: node.text });
          else if (
            options.intent === "references" &&
            (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) &&
            !declaration &&
            !isExcludedReference(node)
          )
            yield matchAt(node, { kind: "reference", name: node.text });
        }
      }
      const children = [];
      ts.forEachChild(node, (child) => {
        children.push(child);
      });
      for (let index = children.length - 1; index >= 0; index--)
        pending.push(children[index]);
    }
  }
}
