/**
 * @file packages/ai-contracts/src/parsePageDraftContext.validator.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Проверяет ограниченный серверный контекст страницы и минимальную browser-ссылку.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */
import type {
  PageDraftContextDTO,
  PageDraftReference,
} from "./PageDraftUpdate.types";
import { ContractValidationError, parseIdentifier } from "./validation";

/** Общие инварианты текстовой проекции и diff, без нормализации сохранённого текста. */
export const pageDraftTextValidation = {
  object(
    value: unknown,
    keys: readonly string[],
    name: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ContractValidationError(`${name} must be a JSON object.`);
    }
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !keys.includes(key))) {
      throw new ContractValidationError(`${name} contains unsupported fields.`);
    }
    return input;
  },
  text(
    value: unknown,
    name: string,
    maxLength: number,
    newText = false,
  ): string {
    if (typeof value !== "string" || value.length > maxLength) {
      throw new ContractValidationError(
        `${name} must be text of at most ${maxLength} characters.`,
      );
    }
    // Обычные переносы строк и табуляция — текст; остальные управляющие символы запрещены.
    if (
      [...value].some((character) => {
        const code = character.charCodeAt(0);
        return (
          (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
          (code >= 127 && code <= 159)
        );
      }) ||
      (newText && /<\s*[!/?a-z]/iu.test(value))
    ) {
      throw new ContractValidationError(
        `${name} contains forbidden control characters or HTML.`,
      );
    }
    return value;
  },
  path(value: unknown): string {
    if (
      typeof value !== "string" ||
      value.length > 512 ||
      !/^\/(?:title|meta\/(?:title|description)|(?:hero\/richText|layout\/(?:0|[1-9]\d*)\/(?:columns\/(?:0|[1-9]\d*)\/richText|richText|content))\/root(?:\/children\/(?:0|[1-9]\d*))+\/text)$/.test(
        value,
      )
    ) {
      throw new ContractValidationError(
        "page text path is not an editable text pointer.",
      );
    }
    return value;
  },
  maxLength(path: string): number {
    return path === "/title" || path === "/meta/title"
      ? 160
      : path === "/meta/description"
        ? 320
        : 4_000;
  },
  hash(value: unknown): string {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
      throw new ContractValidationError(
        "page fingerprint must be a SHA-256 hash.",
      );
    }
    return value;
  },
  date(value: unknown): string {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    ) {
      throw new ContractValidationError(
        "page revision must be an exact ISO timestamp.",
      );
    }
    return value;
  },
};

/** Принимает только server-to-server DTO; не разрешает browser присылать собственный контент. */
export const parsePageDraftContext = (value: unknown): PageDraftContextDTO => {
  const input = pageDraftTextValidation.object(
    value,
    ["page", "updatedAt", "fingerprint", "adapterVersion", "fields"],
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
