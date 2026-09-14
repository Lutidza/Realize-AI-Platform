/**
 * @file packages/ai-contracts/src/parsePageDraftContext.validator.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Проверяет ограниченный серверный контекст страницы и минимальную browser-ссылку.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */
import type {
  PageDraftContextDTO,
  PageDraftReference,
} from "./PageDraftUpdate.types";
import { ContractValidationError, parseIdentifier } from "./validation";

import { pageDraftTextValidation } from "./pageDraftTextValidation.validator";
import { parsePageKnowledge } from "./parsePageKnowledge.validator";

export { pageDraftTextValidation } from "./pageDraftTextValidation.validator";

/** Принимает только server-to-server DTO; не разрешает browser присылать собственный контент. */
export const parsePageDraftContext = (value: unknown): PageDraftContextDTO => {
  const input = pageDraftTextValidation.object(
    value,
    [
      "page",
      "updatedAt",
      "fingerprint",
      "adapterVersion",
      "fields",
      "knowledge",
    ],
    "page context",
  );
  const page = pageDraftTextValidation.object(
    input.page,
    ["id", "slug", "title"],
    "page reference",
  );
  if (
    input.adapterVersion !== "1.0" ||
    !Array.isArray(input.fields) ||
    input.fields.length < 1 ||
    input.fields.length > 128
  ) {
    throw new ContractValidationError(
      "page context requires adapter 1.0 and between 1 and 128 fields.",
    );
  }
  const paths = new Set<string>();
  const fields = input.fields.map((value) => {
    const field = pageDraftTextValidation.object(
      value,
      ["path", "label", "value", "maxLength"],
      "page text field",
    );
    const path = pageDraftTextValidation.path(field.path);
    const maxLength = pageDraftTextValidation.maxLength(path);
    if (paths.has(path) || field.maxLength !== maxLength) {
      throw new ContractValidationError(
        "page text field is duplicated or has an unsupported limit.",
      );
    }
    paths.add(path);
    const label = pageDraftTextValidation.text(field.label, "field label", 240);
    if (!label.trim())
      throw new ContractValidationError("field label must not be empty.");
    return {
      path,
      label,
      value: pageDraftTextValidation.text(
        field.value,
        "field value",
        maxLength,
      ),
      maxLength,
    };
  });
  const title = pageDraftTextValidation.text(page.title, "page title", 160);
  if (!title.trim())
    throw new ContractValidationError("page title must not be empty.");
  const result: PageDraftContextDTO = {
    page: {
      id: parseIdentifier(page.id, "page id"),
      title,
      ...(page.slug !== undefined
        ? { slug: pageDraftTextValidation.text(page.slug, "page slug", 160) }
        : {}),
    },
    updatedAt: pageDraftTextValidation.date(input.updatedAt),
    fingerprint: pageDraftTextValidation.hash(input.fingerprint),
    adapterVersion: "1.0",
    fields,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 64 * 1024) {
    throw new ContractValidationError("page context must not exceed 64 KiB.");
  }
  // Прежний лимит применяется к исходной текстовой проекции до enrichment.
  if (input.knowledge !== undefined) {
    const knowledge = parsePageKnowledge(input.knowledge);
    if (
      knowledge.pageID !== result.page.id ||
      knowledge.fingerprint !== result.fingerprint
    ) {
      throw new ContractValidationError(
        "page knowledge revision does not match its context.",
      );
    }
    result.knowledge = knowledge;
  }
  return result;
};

/** Строгий browser input: сервер сам проверяет доступ и восстанавливает точный контекст. */
export const parsePageDraftReference = (value: unknown): PageDraftReference => {
  const input = pageDraftTextValidation.object(
    value,
    ["id", "fingerprint"],
    "page selection",
  );
  return {
    id: parseIdentifier(input.id, "page id"),
    fingerprint: pageDraftTextValidation.hash(input.fingerprint),
  };
};
