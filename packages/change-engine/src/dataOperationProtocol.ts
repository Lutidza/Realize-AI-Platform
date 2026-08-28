/**
 * @file packages/change-engine/src/dataOperationProtocol.ts
 * @version 2026-08-28
 * @description Владеет assistant protocol для декларативного Payload Data Lane.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import {
  ContractValidationError,
  parseAssignProductCategoryIntent,
  type AssignProductCategoryIntent,
} from "@realize/ai-contracts";

const BLOCK = /```realize-data-operation\s*([\s\S]*?)```/g;

/** Raised when a persisted assistant response cannot become a safe data plan. */
export class DataOperationIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataOperationIntentError";
  }
}

/** Adds a narrow declarative protocol without granting the model write access. */
export const buildDataOperationProtocolInstructions = (): string =>
  [
    "When the user explicitly asks to add one existing category to one existing product, you may propose the governed Payload Data Lane operation.",
    "Only do this when the user supplied an unambiguous product selector and category selector (id, slug, or exact title). Never invent selectors.",
    "Explain the proposed effect in normal Russian text, then append exactly one fenced realize-data-operation JSON block.",
    'The exact schema is: {"version":"1.0","kind":"catalog.assignCategory.v1","product":{"slug":"product-slug"},"category":{"slug":"category-slug"}}.',
    "Each selector must contain exactly one of id, slug, or title. Do not add any other fields.",
    "The block is only a dry-run proposal. Never claim that data was changed, approved, applied, or rolled back.",
    "The read-only restriction applies to you, not to the governed Payload Data Lane executor: after explicit administrator actions, the executor can write through Payload Local API.",
    "Never say that the Payload Data Lane is dry-run-only, and never tell the user to pass the JSON to another administrator.",
    'A chat message such as "подтверждаю", "приступай", or "применяй" is not a hash-bound approval and cannot replace the Data Operation controls.',
    'After proposing an operation, tell the administrator to use the controls attached to that response: click "Шаг 1 · Подготовить изменение данных", inspect "До" and "После", click "Шаг 2 · Подтвердить vN", then click "Шаг 3 · Применить".',
    "If the user later confirms the prior proposal in chat, explain this control sequence instead of repeating the operation block or claiming that writes are unavailable.",
    "Do not emit this block for removals, replacements, bulk changes, protected collections, users, orders, payments, secrets, arbitrary fields, SQL, or generic Payload updates.",
  ].join("\n");

/** Parses exactly one validated operation from persisted assistant text. */
export const parseDataOperationIntentFromAssistant = (
  content: string,
): AssignProductCategoryIntent => {
  const matches = [...content.matchAll(BLOCK)];
  if (matches.length !== 1) {
    throw new DataOperationIntentError(
      matches.length === 0
        ? "В ответе ассистента нет поддерживаемого Data Operation block."
        : "Ответ ассистента содержит несколько Data Operation blocks.",
    );
  }

  try {
    return parseAssignProductCategoryIntent(JSON.parse(matches[0][1].trim()));
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof ContractValidationError
    ) {
      throw new DataOperationIntentError(
        error instanceof Error
          ? `Data Operation block невалиден: ${error.message}`
          : "Data Operation block невалиден.",
      );
    }
    throw error;
  }
};

/** Reports whether a response contains one executable, validated proposal. */
export const hasDataOperationIntent = (content: string): boolean => {
  try {
    parseDataOperationIntentFromAssistant(content);
    return true;
  } catch {
    return false;
  }
};

/** Removes the machine block from browser-visible assistant copy. */
export const stripDataOperationProtocol = (content: string): string => {
  const visible = content.replace(BLOCK, "").trim();
  return visible || "Подготовлено безопасное изменение данных для dry-run.";
};
