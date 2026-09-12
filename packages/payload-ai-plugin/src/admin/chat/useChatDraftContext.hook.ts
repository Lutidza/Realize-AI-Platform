/**
 * @file packages/payload-ai-plugin/src/admin/chat/useChatDraftContext.hook.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Сохраняет вложения и опции черновика до успешной отправки или явного удаления.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_SETTINGS_UPDATED_EVENT } from "../chat-presentation/chatPresentation.constants";
import type {
  ChatCapabilitiesDto,
  ProjectContextFileDto,
} from "@realize/ai-contracts";
import type {
  ChatDraftContextController,
  ChatReadyContext,
  PendingChatAttachment,
} from "./ChatDraftContext.types";
import {
  loadChatCapabilities,
  removeChatAttachment,
  uploadChatAttachment,
} from "./chatContextAPI.adapter";

export const useChatDraftContext = (
  enabled: boolean,
): ChatDraftContextController => {
  const [attachments, setAttachments] = useState<PendingChatAttachment[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectContextFileDto[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [capabilities, setCapabilities] = useState<ChatCapabilitiesDto>();
  const [error, setError] = useState<string>();
  const itemsRef = useRef<PendingChatAttachment[]>([]);
  const uploadsRef = useRef(new Map<string, () => void>());
  const mountedRef = useRef(true);

  const updateItems = useCallback(
    (update: (items: PendingChatAttachment[]) => PendingChatAttachment[]) => {
      itemsRef.current = update(itemsRef.current);
      if (mountedRef.current) setAttachments(itemsRef.current);
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    const uploads = uploadsRef.current;
    return () => {
      mountedRef.current = false;
      for (const cancel of uploads.values()) cancel();
      uploads.clear();
      for (const item of itemsRef.current)
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let current: AbortController | undefined;
    const refresh = () => {
      current?.abort();
      const request = new AbortController();
      current = request;
      void loadChatCapabilities(request.signal)
        .then((next) => {
          if (!request.signal.aborted && current === request)
            setCapabilities(next);
        })
        .catch(() => {
          if (!request.signal.aborted && current === request) {
            setCapabilities(undefined);
            setError("Не удалось проверить доступность вложений и поиска.");
          }
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(CHAT_SETTINGS_UPDATED_EVENT, refresh);
    return () => {
      current?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CHAT_SETTINGS_UPDATED_EVENT, refresh);
    };
  }, [enabled]);

  const upload = useCallback(
    (clientId: string, file: File) => {
      updateItems((items) =>
        items.map((item) =>
          item.clientId === clientId
            ? { ...item, status: "uploading", error: undefined, progress: 0 }
            : item,
        ),
      );
      const request = uploadChatAttachment(file, (progress) =>
        updateItems((items) =>
          items.map((item) =>
            item.clientId === clientId ? { ...item, progress } : item,
          ),
        ),
      );
      uploadsRef.current.set(clientId, request.cancel);
      void request.promise
        .then((attachment) => {
          if (
            !mountedRef.current ||
            !itemsRef.current.some((item) => item.clientId === clientId)
          ) {
            void removeChatAttachment(attachment.id).catch(() => {});
            return;
          }
          updateItems((items) =>
            items.map((item) =>
              item.clientId === clientId
                ? { ...item, attachment, status: "ready", progress: 100 }
                : item,
            ),
          );
        })
        .catch((cause: unknown) => {
          if (
            !mountedRef.current ||
            (cause instanceof DOMException && cause.name === "AbortError")
          )
            return;
          updateItems((items) =>
            items.map((item) =>
              item.clientId === clientId
                ? {
                    ...item,
                    status: "failed",
                    error:
                      cause instanceof Error
                        ? cause.message
                        : "Не удалось загрузить файл.",
                  }
                : item,
            ),
          );
        })
        .finally(() => uploadsRef.current.delete(clientId));
    },
    [updateItems],
  );

  const addAttachments = useCallback(
    (files: File[]) => {
      if (!capabilities?.attachments.available) return;
      const limits = capabilities.attachments;
      let total = itemsRef.current.reduce(
        (sum, item) => sum + (item.file?.size ?? item.attachment?.size ?? 0),
        0,
      );
      const accepted: PendingChatAttachment[] = [];
      for (const file of files) {
        if (itemsRef.current.length + accepted.length >= limits.maxFiles) {
          setError(`Можно прикрепить до ${limits.maxFiles} файлов.`);
          break;
        }
        const isImage =
          /\.(jpe?g|png|webp)$/i.test(file.name) ||
          ["image/jpeg", "image/png", "image/webp"].includes(file.type);
        const limit = isImage ? limits.maxImageBytes : limits.maxTextBytes;
        const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
        const supported =
          limits.extensions.includes(extension) ||
          limits.mimeTypes.includes(file.type);
        const issue = !supported
          ? `${file.name}: поддерживаются изображения JPEG, PNG, WebP и текстовые файлы.`
          : file.size > limit
            ? `${file.name}: файл превышает допустимый размер.`
            : total + file.size > limits.maxTotalBytes
              ? "Превышен общий размер вложений."
              : undefined;
        if (issue) {
          setError(issue);
          continue;
        }
        total += file.size;
        accepted.push({
          clientId: crypto.randomUUID(),
          file,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
          progress: 0,
          status: "uploading",
        });
      }
      updateItems((items) => [...items, ...accepted]);
      for (const item of accepted)
        if (item.file) upload(item.clientId, item.file);
    },
    [capabilities, updateItems, upload],
  );

  const removeAttachment = useCallback(
    async (clientId: string) => {
      const item = itemsRef.current.find(
        (candidate) => candidate.clientId === clientId,
      );
      if (!item) return;
      uploadsRef.current.get(clientId)?.();
      if (item.attachment) {
        updateItems((items) =>
          items.map((candidate) =>
            candidate.clientId === clientId
              ? { ...candidate, isRemoving: true, error: undefined }
              : candidate,
          ),
        );
        try {
          await removeChatAttachment(item.attachment.id);
        } catch {
          updateItems((items) =>
            items.map((candidate) =>
              candidate.clientId === clientId
                ? {
                    ...candidate,
                    isRemoving: false,
                    error: "Не удалось удалить файл. Повторите удаление.",
                  }
                : candidate,
            ),
          );
          return;
        }
      }
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      updateItems((items) =>
        items.filter((candidate) => candidate.clientId !== clientId),
      );
    },
    [updateItems],
  );

  const readReadyContext = useCallback(
    (): ChatReadyContext => ({
      attachments: itemsRef.current.flatMap((item) =>
        item.status === "ready" && item.attachment ? [item.attachment] : [],
      ),
      projectFiles,
      webSearch,
    }),
    [projectFiles, webSearch],
  );
  const restoreContext = useCallback(
    (context: ChatReadyContext) => {
      for (const cancel of uploadsRef.current.values()) cancel();
      for (const item of itemsRef.current)
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      updateItems(() =>
        context.attachments.map((attachment) => ({
          clientId: attachment.id,
          attachment,
          status: "ready",
          progress: 100,
        })),
      );
      setProjectFiles(context.projectFiles);
      setWebSearch(context.webSearch);
    },
    [updateItems],
  );
  const clearSentContext = useCallback(
    (context: ChatReadyContext) => {
      const sent = new Set(context.attachments.map((item) => item.id));
      updateItems((items) =>
        items.filter((item) => {
          if (!item.attachment || !sent.has(item.attachment.id)) return true;
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          return false;
        }),
      );
      const paths = new Set(context.projectFiles.map((item) => item.path));
      setProjectFiles((files) => files.filter((file) => !paths.has(file.path)));
      setWebSearch(false);
    },
    [updateItems],
  );

  return {
    attachments,
    capabilities,
    error,
    projectFiles,
    webSearch,
    hasPendingAttachments: attachments.some(
      (item) => item.status === "uploading" || item.isRemoving,
    ),
    hasFailedAttachments: attachments.some((item) => item.status === "failed"),
    addAttachments,
    removeAttachment,
    setProjectFiles,
    setWebSearch,
    retryAttachment: (clientId) => {
      const item = itemsRef.current.find(
        (candidate) => candidate.clientId === clientId,
      );
      if (item?.file) upload(clientId, item.file);
    },
    clearError: () => setError(undefined),
    readReadyContext,
    restoreContext,
    clearSentContext,
  };
};
