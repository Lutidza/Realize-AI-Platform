/**
 * @file packages/ai-contracts/src/parseGitCommitAuthor.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет и нормализует имя и email автора для API, конфигурации и Git-исполнителя.
 */

import type { GitCommitAuthor } from "./GitCommitAuthor.types";
import { ContractValidationError } from "./validation";

const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f<>\u2028\u2029]/u;
const EMAIL_LOCAL_PART = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

const normalizedText = (
  value: unknown,
  field: string,
  maximum: number,
): string => {
  if (typeof value !== "string" || FORBIDDEN_CHARACTERS.test(value)) {
    throw new ContractValidationError(
      `commitAuthor.${field} contains invalid characters.`,
    );
  }
  const result = value.trim();
  if (!result || result.length > maximum) {
    throw new ContractValidationError(
      `commitAuthor.${field} must contain between 1 and ${maximum} characters.`,
    );
  }
  return result;
};

/** Возвращает новую пару полей; null/omitted обрабатывает контракт сохранения интеграции. */
export const parseGitCommitAuthor = (value: unknown): GitCommitAuthor => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "name") ||
    !Object.hasOwn(value, "email")
  ) {
    throw new ContractValidationError(
      "commitAuthor must contain exactly name and email.",
    );
  }
  const source = value as Record<string, unknown>;
  const name = normalizedText(source.name, "name", 160);
  const email = normalizedText(source.email, "email", 254);
  const [local, domain, extra] = email.split("@");
  if (
    !local ||
    !domain ||
    extra !== undefined ||
    local.length > 64 ||
    !EMAIL_LOCAL_PART.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !domain.split(".").every((label) => EMAIL_DOMAIN_LABEL.test(label))
  ) {
    throw new ContractValidationError(
      "commitAuthor.email must be a valid email address.",
    );
  }
  return { name, email };
};
