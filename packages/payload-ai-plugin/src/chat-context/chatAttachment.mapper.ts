/**
 * @file packages/payload-ai-plugin/src/chat-context/chatAttachment.mapper.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Выдаёт только безопасные метаданные и адрес авторизованного скачивания.
 */
import type { ChatAttachmentDto } from "@realize/ai-contracts";
import { DEFAULT_API_ROUTE } from "../constants";
import type { ChatAttachmentDocument } from "./ChatAttachment.types";
export const toChatAttachmentDto = (
  document: ChatAttachmentDocument,
): ChatAttachmentDto => ({
  id: String(document.id),
  name: document.name,
  mimeType: document.mimeType,
  size: document.size,
  kind: document.kind,
  url: `/api${DEFAULT_API_ROUTE}/chat/attachments/${encodeURIComponent(String(document.id))}/file`,
});
