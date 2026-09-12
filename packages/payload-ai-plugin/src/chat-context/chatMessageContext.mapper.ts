/**
 * @file packages/payload-ai-plugin/src/chat-context/chatMessageContext.mapper.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Восстанавливает только пользовательскую проекцию контекста с defaults старой истории.
 */
import type {
  ChatAttachmentDto,
  ProjectContextFileDto,
} from "@realize/ai-contracts";
import { DEFAULT_API_ROUTE } from "../constants";
import type { ChatMessageContext } from "./ChatAttachment.types";

export const toChatMessageContext = (value: unknown): ChatMessageContext => {
  const context =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const attachments: ChatAttachmentDto[] = [];
  for (const item of Array.isArray(context.attachments)
    ? context.attachments.slice(0, 5)
    : []) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
      typeof item.name !== "string" ||
      typeof item.mimeType !== "string" ||
      typeof item.size !== "number" ||
      !["image", "text"].includes(item.kind)
    )
      continue;
    attachments.push({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      kind: item.kind,
      url: `/api${DEFAULT_API_ROUTE}/chat/attachments/${encodeURIComponent(item.id)}/file`,
    });
  }
  const projectFiles: ProjectContextFileDto[] = [];
  for (const item of Array.isArray(context.projectFiles)
    ? context.projectFiles.slice(0, 10)
    : []) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.path !== "string" ||
      typeof item.size !== "number" ||
      typeof item.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      continue;
    projectFiles.push({
      path: item.path,
      size: item.size,
      sha256: item.sha256,
    });
  }
  return { attachments, projectFiles, webSearch: context.webSearch === true };
};
