/**
 * @file packages/change-engine/src/dataOperationProtocol.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Владеет assistant protocol для декларативного Payload Data Lane.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import {
  ContractValidationError,
  parseDataOperationIntent,
  type DataOperationIntent,
} from "@realize/ai-contracts";

const BLOCK = /```realize-data-operation\s*([\s\S]*?)```/g;

/** Ошибка преобразования сохранённого ответа ассистента в безопасный план данных. */
export class DataOperationIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataOperationIntentError";
  }
}

/** Объясняет ограниченный декларативный протокол без предоставления модели права записи. */
export const buildDataOperationProtocolInstructions = (): string =>
  [
    "You can propose two governed Payload Data Lane operations: assign one existing category to one existing product, or create one CMS page draft with bounded plain text sections.",
    "When the user asks to create an ordinary CMS content page (for example an About page with demo content), use pages.createDraft.v1. It creates a record in the pages collection, not a code change: do not propose source files, an execution worker task, or a code Change Request for this supported operation.",
    "Do not refuse a supported page draft request because your chat session is read-only. You prepare the proposal; the authorized administrator applies it through the existing controls after inspecting and approving the exact content.",
    "For pages.createDraft.v1, the user may provide content or explicitly ask for demo content. Draft the requested text without inventing factual claims about their business; identify demo copy as sample content. If the requested page purpose is unclear, ask for that purpose before proposing.",
    'The page schema is: {"version":"1.0","kind":"pages.createDraft.v1","title":"О компании","slug":"about","sections":[{"heading":"О нас","body":"Демонстрационный текст о компании."}],"description":"Демонстрационная страница о компании"}. description and section.heading are optional; all other fields are required.',
    "Page limits: title and each heading 1–160 characters; slug 1–100 lowercase Latin letters/digits separated by single hyphens; 1–12 sections; each body 1–4000 characters; all section bodies/headings together at most 16000 characters; optional description 1–320 characters. All content is plain text, no HTML, raw Payload/Lexical, SQL, script, relationships, _status or extra fields.",
    "The server checks access, reserved or occupied slugs and exact draft content during preparation and again when applying. Do not claim to have checked the database or require database browsing before proposing a draft. If preparation reports a slug conflict, propose another slug only after the administrator chooses it.",
    "Page creation always creates an unpublished draft. Never claim it is published or publicly visible. Publishing or modifying an existing page is outside this operation.",
    "For category assignment only: when the user explicitly asks to add one existing category to one existing product, you may propose catalog.assignCategory.v1.",
    "Only do this when the user supplied an unambiguous product selector and category selector (id, slug, or exact title). Never invent selectors.",
    "Explain the proposed effect in normal Russian text, then append exactly one fenced realize-data-operation JSON block.",
    'The category schema is: {"version":"1.0","kind":"catalog.assignCategory.v1","product":{"slug":"product-slug"},"category":{"slug":"category-slug"}}.',
    "Each selector must contain exactly one of id, slug, or title. Do not add any other fields.",
    "The block is only a dry-run proposal. Never claim that data was changed, approved, applied, or rolled back.",
    "The read-only restriction applies to you, not to the governed Payload Data Lane executor: after explicit administrator actions, the executor can write through Payload Local API.",
    "Never say that the Payload Data Lane is dry-run-only, and never tell the user to pass the JSON to another administrator.",
    'A chat message such as "подтверждаю", "приступай", or "применяй" is not a hash-bound approval and cannot replace the Data Operation controls.',
    'After proposing pages.createDraft.v1, tell the administrator to click "Подготовить изменение данных", inspect the full proposed page title, slug and text, click "Подтвердить создание", then "Создать черновик". After successful creation, the result provides "Открыть черновик".',
    'After proposing catalog.assignCategory.v1, tell the administrator to use the controls attached to that response: click "Шаг 1 · Подготовить изменение данных", inspect "До" and "После", click "Шаг 2 · Подтвердить vN", then click "Шаг 3 · Применить".',
    "If the user later confirms the prior proposal in chat, explain this control sequence instead of repeating the operation block or claiming that writes are unavailable.",
    "Do not emit this block for removals, replacements, bulk changes, protected collections, users, orders, payments, secrets, arbitrary fields, SQL, or generic Payload updates.",
  ].join("\n");

/** Извлекает ровно одну валидную операцию из сохранённого текста ассистента. */
export const parseDataOperationIntentFromAssistant = (
  content: string,
): DataOperationIntent => {
  const matches = [...content.matchAll(BLOCK)];
  if (matches.length !== 1) {
    throw new DataOperationIntentError(
      matches.length === 0
        ? "В ответе ассистента нет поддерживаемого Data Operation block."
        : "Ответ ассистента содержит несколько Data Operation blocks.",
    );
  }

  try {
    return parseDataOperationIntent(JSON.parse(matches[0][1].trim()));
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

/** Проверяет наличие одного валидного исполняемого предложения. */
export const hasDataOperationIntent = (content: string): boolean => {
  try {
    parseDataOperationIntentFromAssistant(content);
    return true;
  } catch {
    return false;
  }
};

/** Скрывает машинный блок в отображаемом тексте ответа. */
export const stripDataOperationProtocol = (content: string): string => {
  const visible = content.replace(BLOCK, "").trim();
  return visible || "Подготовлено безопасное изменение данных для dry-run.";
};
