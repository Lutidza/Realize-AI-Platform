/**
 * @file .ai/tools/agent-search/src/parseSyntaxSource.util.d.mts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Объявляет тип результата общего ограниченного TS/JS parser.
 */
import type ts from "typescript";
export function parseSyntaxSource(
  fileName: string,
  text: string,
):
  | { status: "parsed"; source: ts.SourceFile }
  | { status: "unsupported" | "size" | "syntax_error" };
