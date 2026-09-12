/**
 * @file packages/ai-contracts/src/parseCreatePageDraftIntent.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет ограниченное текстовое предложение создания черновика страницы без Payload-полей.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type {
  CreatePageDraftIntent,
  PageDraftSection,
} from "./PageDraftCreation.types";
import { ContractValidationError } from "./validation";

const objectWithKeys = (
  value: unknown,
  allowedKeys: readonly string[],
  name: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractValidationError(`${name} must be a JSON object.`);
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !allowedKeys.includes(key))) {
    throw new ContractValidationError(`${name} contains unsupported fields.`);
  }
  return object;
};

const plainText = (
  value: unknown,
  name: string,
  maxLength: number,
  multiline = false,
): string => {
  if (typeof value !== "string") {
    throw new ContractValidationError(`${name} must be plain text.`);
  }
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw new ContractValidationError(
      `${name} must contain between 1 and ${maxLength} characters.`,
    );
  }
  // Управляющие символы и HTML отклоняются до преобразования в rich text.
  const hasForbiddenControl = [...text].some((character) => {
    const code = character.charCodeAt(0);
    return (
      code === 127 ||
      (code < 32 && !(multiline && (code === 9 || code === 10 || code === 13)))
    );
  });
  if (hasForbiddenControl || /<\s*[!/?a-z]/iu.test(text)) {
    throw new ContractValidationError(
      `${name} must be plain text without HTML.`,
    );
  }
  return text;
};

/** Валидирует один безопасный текстовый рецепт; доступ и свободный slug проверяет сервер. */
export const parseCreatePageDraftIntent = (
  value: unknown,
): CreatePageDraftIntent => {
  const input = objectWithKeys(
    value,
    ["description", "kind", "sections", "slug", "title", "version"],
    "page draft operation",
  );
  if (input.version !== "1.0" || input.kind !== "pages.createDraft.v1") {
    throw new ContractValidationError(
      "page draft operation kind or version is not supported.",
    );
  }
  const slug = plainText(input.slug, "page slug", 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ContractValidationError(
      "page slug must use lowercase Latin letters, digits and single hyphens.",
    );
  }
  if (
    !Array.isArray(input.sections) ||
    input.sections.length < 1 ||
    input.sections.length > 12
  ) {
    throw new ContractValidationError(
      "page sections must contain between 1 and 12 items.",
    );
  }
  const sections: PageDraftSection[] = input.sections.map((value, index) => {
    const section = objectWithKeys(
      value,
      ["body", "heading"],
      `page section ${index + 1}`,
    );
    return {
      body: plainText(section.body, "section body", 4_000, true),
      ...(section.heading !== undefined
        ? { heading: plainText(section.heading, "section heading", 160) }
        : {}),
    };
  });
  if (
    sections.reduce(
      (length, section) =>
        length + section.body.length + (section.heading?.length ?? 0),
      0,
    ) > 16_000
  ) {
    throw new ContractValidationError(
      "page sections must not exceed 16000 characters in total.",
    );
  }
  return {
    ...(input.description !== undefined
      ? { description: plainText(input.description, "page description", 320) }
      : {}),
    kind: "pages.createDraft.v1",
    sections,
    slug,
    title: plainText(input.title, "page title", 160),
    version: "1.0",
  };
};
