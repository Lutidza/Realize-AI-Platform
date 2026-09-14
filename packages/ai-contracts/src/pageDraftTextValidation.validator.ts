/**
 * @file packages/ai-contracts/src/pageDraftTextValidation.validator.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет общие примитивы ревизии и неизменённого текстового контракта страницы.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */
import { ContractValidationError } from "./validation";

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
