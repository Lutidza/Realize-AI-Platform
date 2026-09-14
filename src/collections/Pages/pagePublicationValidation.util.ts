/**
 * @file src/collections/Pages/pagePublicationValidation.util.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет ограниченные значения страницы и накапливает безопасные диагностические записи.
 */
import { PagePublicationValidationError } from "./pagePublicationValidation.error";
import type { PagePublicationValidationContext } from "./pagePublicationValidation.types";

export const pagePublicationIssue = (
  context: PagePublicationValidationContext,
  target: string,
  message: string,
): never => {
  if (context.checks.length < 99)
    context.checks.push({
      id: `content-${context.checks.length}`,
      status: "failed",
      severity: "error",
      ...(target.length <= 300 ? { target } : {}),
      message,
    });
  else if (context.checks.length === 99)
    context.checks.push({
      id: "checks-limit",
      status: "failed",
      severity: "error",
      message:
        "Число проблем превышает границу проверки. Исправьте показанные ошибки и повторите проверку.",
    });
  throw new PagePublicationValidationError();
};
export const pagePublicationRecord = (
  value: unknown,
  context: PagePublicationValidationContext,
  path: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return pagePublicationIssue(
      context,
      path,
      "Ожидается корректная структура поля.",
    );
  return value as Record<string, unknown>;
};
export const pagePublicationText = (
  value: unknown,
  context: PagePublicationValidationContext,
  path: string,
  max = 4000,
  required = false,
): string => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    return pagePublicationIssue(
      context,
      path,
      "Текст отсутствует или превышает допустимую длину.",
    );
  return value;
};
export const pagePublicationList = (
  value: unknown,
  context: PagePublicationValidationContext,
  path: string,
  max: number,
): unknown[] => {
  if (!Array.isArray(value) || value.length > max)
    return pagePublicationIssue(
      context,
      path,
      "Список отсутствует или превышает границу проверки публикации.",
    );
  return value;
};
export const pagePublicationChoice = (
  value: unknown,
  allowed: readonly string[],
  context: PagePublicationValidationContext,
  path: string,
): string => {
  if (typeof value !== "string" || !allowed.includes(value))
    return pagePublicationIssue(
      context,
      path,
      "Значение не поддержано установленным компонентом страницы.",
    );
  return value;
};

/** Неизвестные поля могут скрывать зависимость, отсутствующую в подтверждённой политике. */
export const pagePublicationKnown = (
  value: unknown,
  keys: readonly string[],
  context: PagePublicationValidationContext,
  path: string,
): Record<string, unknown> => {
  const record = pagePublicationRecord(value, context, path);
  if (Object.keys(record).some((key) => !keys.includes(key)))
    pagePublicationIssue(
      context,
      path,
      "Страница содержит неподдержанные поля. Публикация этой структуры пока недоступна.",
    );
  return record;
};
