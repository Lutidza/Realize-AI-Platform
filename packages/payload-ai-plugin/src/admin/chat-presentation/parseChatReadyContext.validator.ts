/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/parseChatReadyContext.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Ограничивает готовый контекст межоконного обмена и приватные URL вложений.
 */

import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_PROJECT_FILE_LIMIT,
} from "@realize/ai-contracts";

import type { ChatReadyContext } from "../chat/ChatDraftContext.types";
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const size = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Origin и source проверяются transport-хуком до применения валидированного DTO. */
export const parseChatReadyContext = (
  value: unknown,
): ChatReadyContext | undefined => {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => !["attachments", "projectFiles", "webSearch"].includes(key),
    ) ||
    !Array.isArray(value.attachments) ||
    value.attachments.length > CHAT_ATTACHMENT_LIMITS.maxFiles ||
    !Array.isArray(value.projectFiles) ||
    value.projectFiles.length > CHAT_PROJECT_FILE_LIMIT ||
    typeof value.webSearch !== "boolean"
  )
    return;
  const attachments: ChatReadyContext["attachments"] = [];
  for (const item of value.attachments) {
    if (
      !record(item) ||
      !text(item.id, 128) ||
      !/^[A-Za-z0-9_-]+$/.test(item.id) ||
      !text(item.name, 255) ||
      !text(item.mimeType, 128) ||
      !size(item.size) ||
      item.size > CHAT_ATTACHMENT_LIMITS.maxImageBytes ||
      (item.kind !== "image" && item.kind !== "text") ||
      item.url !==
        `/api/realize-ai/chat/attachments/${encodeURIComponent(item.id)}/file`
    )
      return;
    attachments.push({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      kind: item.kind,
      url: item.url,
    });
  }
  if (
    attachments.reduce((sum, item) => sum + item.size, 0) >
    CHAT_ATTACHMENT_LIMITS.maxTotalBytes
  )
    return;
  const projectFiles: ChatReadyContext["projectFiles"] = [];
  for (const item of value.projectFiles) {
    if (
      !record(item) ||
      !text(item.path, 1024) ||
      item.path.startsWith("/") ||
      item.path.split("/").includes("..") ||
      item.path.includes("\\") ||
      !size(item.size) ||
      !text(item.sha256, 64) ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      return;
    projectFiles.push({
      path: item.path,
      size: item.size,
      sha256: item.sha256,
    });
  }
  return { attachments, projectFiles, webSearch: value.webSearch };
};
