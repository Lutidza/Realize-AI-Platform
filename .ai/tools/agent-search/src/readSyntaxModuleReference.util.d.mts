/**
 * @file .ai/tools/agent-search/src/readSyntaxModuleReference.util.d.mts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Объявляет общий AST-контракт module references для поиска и инженерных изменений.
 */
import type ts from "typescript";
import type { SyntaxModuleReference } from "./SyntaxSearch.types.d.mts";
export function readSyntaxModuleReference(
  node: ts.Node,
): SyntaxModuleReference | undefined;
