/**
 * @file .ai/tools/engineering/src/readJsonProperties.util.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Читает однозначные свойства native JSON AST для точечных config effects.
 * @see documentation/architecture/engineering-operations.md
 */
import ts from "typescript";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";

/** Не разрешает дублирующие ключи, вычисляемые свойства и не-JSON syntax. */
export function readJsonProperties(
  node: ts.Node | undefined,
): Map<string, ts.Expression> {
  if (!node || !ts.isObjectLiteralExpression(node)) invalid();
  const result = new Map<string, ts.Expression>();
  for (const property of node.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isStringLiteral(property.name) ||
      result.has(property.name.text)
    )
      invalid();
    result.set(property.name.text, property.initializer);
  }
  return result;
}

function invalid(): never {
  throw new ProjectArtifactError(
    "UNSUPPORTED",
    "JSON patch требует object с уникальными строковыми ключами.",
  );
}
