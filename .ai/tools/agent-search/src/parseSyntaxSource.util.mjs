/**
 * @file .ai/tools/agent-search/src/parseSyntaxSource.util.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Разбирает ограниченный TS/JS текст без файловой системы, исполнения и связывания символов.
 */
import ts from "typescript";
import {
  isSyntaxSearchFile,
  SYNTAX_MAX_FILE_BYTES,
} from "./syntaxSearch.config.mjs";

export function parseSyntaxSource(fileName, text) {
  if (!isSyntaxSearchFile(fileName)) return { status: "unsupported" };
  if (Buffer.byteLength(text) > SYNTAX_MAX_FILE_BYTES)
    return { status: "size" };
  const extension = fileName.split(".").pop().toLowerCase();
  const kind =
    extension === "tsx"
      ? ts.ScriptKind.TSX
      : extension === "jsx"
        ? ts.ScriptKind.JSX
        : ["js", "mjs", "cjs"].includes(extension)
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  try {
    const source = ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    return source.parseDiagnostics.length
      ? { status: "syntax_error" }
      : { status: "parsed", source };
  } catch (error) {
    if (error instanceof RangeError) return { status: "syntax_error" };
    throw error;
  }
}
