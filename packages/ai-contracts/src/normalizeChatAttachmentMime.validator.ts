/**
 * @file packages/ai-contracts/src/normalizeChatAttachmentMime.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет заявленный формат по разрешённому расширению перед проверкой байтов сервером.
 */
import { ContractValidationError } from "./validation";

/** Браузер может обозначить TypeScript как video/mp2t; содержимое всё равно проверяет storage. */
export const normalizeChatAttachmentMime = (name: string): string => {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".js": "text/javascript",
    ".jsx": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
  };
  if (!types[extension])
    throw new ContractValidationError(
      "Неподдерживаемый формат. Выберите JPEG, PNG, WebP или UTF-8 текстовый файл.",
    );
  return types[extension];
};
