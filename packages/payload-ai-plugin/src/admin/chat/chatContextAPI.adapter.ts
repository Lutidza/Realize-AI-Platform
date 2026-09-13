/**
 * @file packages/payload-ai-plugin/src/admin/chat/chatContextAPI.adapter.ts
 * @version 1.1.0
 * @date 2026-09-12
 * @description Передаёт вложения и читает разрешённые файлы и страницы для контекста чата.
 */

import type {
  APIResponse,
  ChatAttachmentDto,
  ChatCapabilitiesDto,
  PageDraftCatalogDTO,
  PageDraftContextDTO,
  ProjectContextFilesDto,
} from "@realize/ai-contracts";
import { REALIZE_AI_API_ROOT, requestRealizeAI } from "../realizeAIAPI";
import type { ChatUploadResult } from "./ChatDraftContext.types";

/** XHR сообщает настоящий прогресс отправки; multipart boundary устанавливает браузер. */
export const uploadChatAttachment = (
  file: File,
  onProgress: (percent: number) => void,
): ChatUploadResult => {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<ChatAttachmentDto>((resolve, reject) => {
    xhr.open("POST", `${REALIZE_AI_API_ROOT}/chat/attachments`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Idempotency-Key", crypto.randomUUID());
    xhr.timeout = 120_000;
    xhr.ontimeout = () =>
      reject(new Error("Время загрузки истекло. Повторите попытку."));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Не удалось загрузить файл. Проверьте соединение и повторите.",
        ),
      );
    xhr.onabort = () =>
      reject(new DOMException("Загрузка отменена.", "AbortError"));
    xhr.onload = () => {
      try {
        const result = JSON.parse(
          xhr.responseText,
        ) as APIResponse<ChatAttachmentDto>;
        if (!result.ok) throw new Error(result.error.message);
        if (xhr.status < 200 || xhr.status >= 300)
          throw new Error("Не удалось сохранить файл.");
        resolve(result.data);
      } catch (cause) {
        reject(
          cause instanceof Error
            ? cause
            : new Error("Не удалось прочитать результат загрузки."),
        );
      }
    };
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
  return { promise, cancel: () => xhr.abort() };
};

export const removeChatAttachment = (id: string) =>
  requestRealizeAI<unknown>(`/chat/attachments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
export const loadChatCapabilities = (signal: AbortSignal) =>
  requestRealizeAI<ChatCapabilitiesDto>("/chat/capabilities", { signal });
export const searchChatProjectFiles = (query: string, signal: AbortSignal) =>
  requestRealizeAI<ProjectContextFilesDto>(
    `/chat/project-files?q=${encodeURIComponent(query)}`,
    { signal },
  );

export const searchChatPageDrafts = (
  query: string,
  page: number,
  signal: AbortSignal,
) =>
  requestRealizeAI<PageDraftCatalogDTO>(
    `/chat/page-drafts?q=${encodeURIComponent(query)}&page=${page}`,
    { signal },
  );

export const loadChatPageDraft = (id: string, signal: AbortSignal) =>
  requestRealizeAI<PageDraftContextDTO>(
    `/chat/page-drafts/${encodeURIComponent(id)}`,
    { signal },
  );
