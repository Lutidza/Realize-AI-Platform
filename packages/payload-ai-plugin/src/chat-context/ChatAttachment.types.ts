/**
 * @file packages/payload-ai-plugin/src/chat-context/ChatAttachment.types.ts
 * @version 1.1.0
 * @date 2026-09-12
 * @description Отделяет закрытые метаданные хранилища от пользовательского снимка сообщения.
 */
import type {
  ChatAttachmentDto,
  MessageDTO,
  RunDTO,
  ProjectContextFileDto,
  DataDocumentRefDTO,
} from "@realize/ai-contracts";
export type ChatAttachmentDocument = {
  id: number | string;
  assetID: string;
  createdBy: number | string | { id: number | string };
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "text";
  sha256: string;
  expiresAt: string;
  runID?: string;
};
export type ChatMessageContext = {
  pageDraft?: DataDocumentRefDTO;
  attachments: ChatAttachmentDto[];
  projectFiles: ProjectContextFileDto[];
  webSearch: boolean;
};
export type ChatAttachmentLocalAPI = {
  find: (
    args: Record<string, unknown>,
  ) => Promise<{ docs: ChatAttachmentDocument[] }>;
  create: (args: Record<string, unknown>) => Promise<ChatAttachmentDocument>;
  update: (args: Record<string, unknown>) => Promise<ChatAttachmentDocument>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
};

export type CreateChatMessageResult = { message?: MessageDTO; run: RunDTO };
