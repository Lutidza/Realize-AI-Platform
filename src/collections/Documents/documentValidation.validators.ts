/**
 * @file src/collections/Documents/documentValidation.validators.ts
 * @version 1.0.1
 * @date 2026-11-24
 * @description Проверяет содержимое документов, сохраняя штатные ограничения полей Payload.
 * @see documentation/specifications/realize-ai-control-panel/documents/collection-and-access.md
 */
import type {
  ArrayFieldValidation,
  TextareaFieldValidation,
  TextFieldSingleValidation,
} from "payload";
import { array, text, textarea } from "payload/shared";
import { isDocumentSlug } from "./documentIdentifiers";

export const validateDocumentTitle: TextFieldSingleValidation = async (
  value,
  options,
) => {
  const candidate =
    value === undefined && options.operation === "update"
      ? options.previousValue
      : value;
  const result = await text(candidate, options);
  if (result !== true) return result;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? true
    : "Введите непустой заголовок.";
};

export const validateDocumentIdentifier: TextFieldSingleValidation = async (
  value,
  options,
) => {
  const candidate =
    value === undefined && options.operation === "update"
      ? options.previousValue
      : value;
  const result = await text(candidate, options);
  if (result !== true) return result;
  return isDocumentSlug(candidate)
    ? true
    : "Используйте строчные латинские буквы, цифры и одиночные дефисы (до 128 символов).";
};

export const validateDocumentParagraph: TextareaFieldValidation = async (
  value,
  options,
) => {
  const candidate =
    value === undefined && options.operation === "update"
      ? options.previousValue
      : value;
  const result = await textarea(candidate, options);
  if (result !== true) return result;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? true
    : "Введите непустой текст абзаца.";
};

/** Уникальность проверяется по явному anchor, независимо от native row id. */
export const validateDocumentSections: ArrayFieldValidation = async (
  value,
  options,
) => {
  const candidate =
    value === undefined && options.operation === "update"
      ? options.previousValue
      : value;
  const result = await array(candidate, options);
  if (result !== true) return result;
  if (!Array.isArray(candidate)) return "Добавьте хотя бы один раздел.";
  const anchors = new Set<string>();
  for (const section of candidate) {
    if (
      !section ||
      typeof section !== "object" ||
      !("anchor" in section) ||
      !isDocumentSlug(section.anchor)
    )
      return "У каждого раздела должен быть корректный anchor.";
    if (anchors.has(section.anchor))
      return "Anchors разделов должны быть уникальны внутри документа.";
    anchors.add(section.anchor);
  }
  return true;
};
