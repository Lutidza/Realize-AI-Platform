/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/parseAgentLayerWorkflowJSONLiteral.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Разбирает ограниченное JSON-значение формы, отклоняя повторяющиеся поля до потери содержимого.
 */

import { ContractValidationError } from "@realize/ai-contracts";
import type { JSONValue } from "@realize/ai-contracts";

/** JSON.parse проверяет синтаксис; проход по токенам сохраняет контроль повторов, включая escaped keys. */
export const parseAgentLayerWorkflowJSONLiteral = (
  text: string,
  type: "number" | "array" | "object",
  label: string,
): JSONValue => {
  if (typeof text !== "string" || text.length > 2_000_000)
    throw new ContractValidationError(
      `${label}: значение превышает предел 2 000 000 символов.`,
    );
  let value: JSONValue;
  try {
    value = JSON.parse(text) as JSONValue;
  } catch {
    throw new ContractValidationError(
      `${label}: исправьте синтаксис JSON-значения.`,
    );
  }
  if (
    (type === "number" &&
      (typeof value !== "number" || !Number.isFinite(value))) ||
    (type === "array" && !Array.isArray(value)) ||
    (type === "object" &&
      (value === null || typeof value !== "object" || Array.isArray(value)))
  )
    throw new ContractValidationError(
      `${label}: значение не соответствует выбранному типу ${type}.`,
    );

  const tokens =
    text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) ?? [];
  let cursor = 0;
  const visit = (depth: number): void => {
    if (depth > 12)
      throw new ContractValidationError(
        `${label}: глубина JSON-значения не должна превышать 12.`,
      );
    const token = tokens[cursor++];
    if (token === "{") {
      const keys = new Set<string>();
      while (tokens[cursor] !== "}") {
        const key = JSON.parse(tokens[cursor++]) as string;
        if (keys.has(key))
          throw new ContractValidationError(
            `${label}: поле «${key.slice(0, 128)}${key.length > 128 ? "…" : ""}» повторяется в одном объекте.`,
          );
        keys.add(key);
        cursor++;
        visit(depth + 1);
        if (tokens[cursor] === ",") cursor++;
      }
      cursor++;
    } else if (token === "[") {
      while (tokens[cursor] !== "]") {
        visit(depth + 1);
        if (tokens[cursor] === ",") cursor++;
      }
      cursor++;
    }
  };
  visit(0);
  return value;
};
