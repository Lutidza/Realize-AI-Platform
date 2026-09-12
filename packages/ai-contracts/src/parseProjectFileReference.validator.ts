/**
 * @file packages/ai-contracts/src/parseProjectFileReference.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет ограниченную ссылку на файл проекта без доступа к файловой системе.
 */
import { ContractValidationError } from "./validation";
import type { ProjectFileReference } from "./ChatContext.types";
/** Путь остаётся относительным указателем; доступ к файлу повторно проверяет сервер. */
export const parseProjectFileReference = (
  value: unknown,
): ProjectFileReference => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ContractValidationError("Некорректный файл проекта.");
  const file = value as Record<string, unknown>;
  if (
    Object.keys(file).some((key) => !["path", "sha256"].includes(key)) ||
    typeof file.path !== "string" ||
    file.path.length > 512 ||
    !file.path ||
    /[\\\x00-\x1f]/.test(file.path) ||
    file.path.startsWith("/") ||
    file.path
      .split("/")
      .some((part) => !part || part === "." || part === "..") ||
    typeof file.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(file.sha256)
  )
    throw new ContractValidationError("Некорректная ссылка на файл проекта.");
  return { path: file.path, sha256: file.sha256 };
};
