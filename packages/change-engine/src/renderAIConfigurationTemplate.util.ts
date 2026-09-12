/**
 * @file packages/change-engine/src/renderAIConfigurationTemplate.util.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Подставляет только разрешённые переменные шаблона как bounded JSON-quoted данные.
 */

import type { AIPromptTemplateDefinition } from "@realize/ai-contracts";
import { AIConfigurationPolicyError } from "./aiConfigurationError";

const MAX_INSTRUCTION_BYTES = 128 * 1024;
const TEMPLATE_VARIABLE = /\{\{\s*([A-Za-z0-9._-]+)\s*\}\}/g;

/** Выполняет одну подстановку без повторного исполнения скобок из пользовательского текста. */
export const renderAIConfigurationTemplate = (
  template: AIPromptTemplateDefinition,
  variables: Readonly<Record<string, string>>,
): string => {
  for (const variable of template.variables) {
    if (!Object.hasOwn(variables, variable)) {
      throw new AIConfigurationPolicyError(
        `Unsupported active template variable: ${variable}.`,
      );
    }
  }
  let byteLength = Buffer.byteLength(template.template, "utf8");
  return template.template.replace(
    TEMPLATE_VARIABLE,
    (placeholder, variable: string) => {
      if (
        !template.variables.includes(variable) ||
        !Object.hasOwn(variables, variable)
      ) {
        throw new AIConfigurationPolicyError(
          `Unsupported active template variable: ${variable}.`,
        );
      }
      // Одна подстановка: фигурные скобки из request/context никогда не исполняются повторно.
      const replacement = JSON.stringify(variables[variable]);
      byteLength +=
        Buffer.byteLength(replacement, "utf8") -
        Buffer.byteLength(placeholder, "utf8");
      if (byteLength > MAX_INSTRUCTION_BYTES) {
        throw new AIConfigurationPolicyError(
          "Rendered agent instructions exceed 128 KiB of UTF-8 text.",
        );
      }
      return replacement;
    },
  );
};
