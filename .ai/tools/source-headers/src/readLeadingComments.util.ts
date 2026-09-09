/**
 * @file .ai/tools/source-headers/src/readLeadingComments.util.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Извлекает начальные комментарии, сохраняя границы шапки и директив языка.
 */

import ts from "typescript";

import type { HeaderCommentStyle } from "./SourceHeaders.types.ts";

export const readLeadingComments = (
  source: string,
  style: HeaderCommentStyle,
): string[] => {
  const text = source.replace(/^\uFEFF/, "");
  const comments: string[] = [];
  if (style === "tsdoc") {
    const parsed = ts.createSourceFile(
      "header.tsx",
      text,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX,
    );
    const firstCode = parsed.statements.find(
      (statement) =>
        !ts.isExpressionStatement(statement) ||
        !ts.isStringLiteral(statement.expression),
    );
    const prefix = text.slice(0, firstCode?.getStart(parsed) ?? text.length);
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      prefix,
    );
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      const comment = scanner.getTokenText();
      if (
        token === ts.SyntaxKind.MultiLineCommentTrivia &&
        comment.startsWith("/**") &&
        comment.endsWith("*/")
      ) {
        comments.push(comment.slice(3, -2));
      }
    }
    return comments;
  }

  if (style === "hash") {
    let block: string[] = [];
    for (const line of text.replace(/^#![^\n]*(?:\n|$)/, "").split(/\r?\n/)) {
      if (!line.trim()) {
        if (block.length) comments.push(block.join("\n"));
        block = [];
      } else if (/^\s*#/.test(line)) {
        block.push(line.replace(/^\s*# ?/, ""));
      } else break;
    }
    if (block.length) comments.push(block.join("\n"));
    return comments;
  }

  let rest = text.trimStart();
  if (style === "markup") {
    rest = rest
      .replace(/^<\?xml\b[\s\S]*?\?>\s*/, "")
      .replace(/^<!DOCTYPE\b[^>]*>\s*/i, "");
  }
  const open = style === "markup" ? "<!--" : "/*";
  const close = style === "markup" ? "-->" : "*/";
  while (rest.startsWith(open)) {
    const end = rest.indexOf(close, open.length);
    if (end < 0) break;
    comments.push(rest.slice(open.length, end));
    rest = rest.slice(end + close.length).trimStart();
  }
  return comments;
};
