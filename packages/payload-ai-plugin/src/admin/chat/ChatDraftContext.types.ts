/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatDraftContext.types.ts
 * @version 1.1.0
 * @date 2026-09-12
 * @description Разделяет локальные файлы загрузки и переносимый контекст черновика чата.
 */

import type {
  ChatAttachmentDto,
  ChatCapabilitiesDto,
  DataDocumentRefDTO,
  PageDraftReference,
  ProjectContextFileDto,
} from "@realize/ai-contracts";

/** File и object URL существуют только в памяти текущего браузерного provider. */
export type PendingChatAttachment = {
  clientId: string;
  file?: File;
  previewUrl?: string;
  status: "uploading" | "ready" | "failed";
  progress: number;
  attachment?: ChatAttachmentDto;
  error?: string;
  isRemoving?: boolean;
};

/** Межоконный перенос содержит готовые DTO, без File, object URL и содержимого документов. */
export type ChatReadyContext = {
  attachments: ChatAttachmentDto[];
  projectFiles: ProjectContextFileDto[];
  webSearch: boolean;
  pageDraft?: ChatPageDraftSelection;
};

/** Подпись служит только интерфейсу; запись связывается с серверным fingerprint. */
export type ChatPageDraftSelection = DataDocumentRefDTO & PageDraftReference;

export type ChatDraftContextController = {
  attachments: PendingChatAttachment[];
  capabilities?: ChatCapabilitiesDto;
  error?: string;
  projectFiles: ProjectContextFileDto[];
  webSearch: boolean;
  pageDraft?: ChatPageDraftSelection;
  isSelectingPageDraft: boolean;
  selectPageDraft: (id: string) => Promise<void>;
  removePageDraft: () => void;
  hasPendingAttachments: boolean;
  hasFailedAttachments: boolean;
  addAttachments: (files: File[]) => void;
  retryAttachment: (clientId: string) => void;
  removeAttachment: (clientId: string) => Promise<void>;
  setProjectFiles: (files: ProjectContextFileDto[]) => void;
  setWebSearch: (enabled: boolean) => void;
  clearError: () => void;
  readReadyContext: () => ChatReadyContext;
  restoreContext: (context: ChatReadyContext) => void;
  clearSentContext: (context: ChatReadyContext) => void;
};

export type ChatUploadResult = {
  promise: Promise<ChatAttachmentDto>;
  cancel: () => void;
};
