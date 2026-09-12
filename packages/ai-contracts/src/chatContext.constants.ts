/**
 * @file packages/ai-contracts/src/chatContext.constants.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет общие ограничения реальных вложений и контекста сообщения.
 */

export const CHAT_ATTACHMENT_LIMITS = {
  maxFiles: 5,
  extensions: [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".html",
    ".xml",
    ".yaml",
    ".yml",
  ],
  maxImageBytes: 8 * 1024 * 1024,
  maxTextBytes: 256 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  mimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/javascript",
    "text/typescript",
    "text/html",
    "text/css",
    "application/json",
    "application/xml",
    "text/xml",
    "application/yaml",
    "text/yaml",
  ],
} as const;
export const CHAT_PROJECT_FILE_LIMIT = 10;
export const CHAT_PENDING_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;
