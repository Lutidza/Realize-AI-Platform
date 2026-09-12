/**
 * @file packages/payload-ai-plugin/src/admin/chat/useChatComposer.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Обрабатывает выбор, вставку и перенос файлов в единый composer.
 */

"use client";
import { useCallback, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import type { ChatDraftContextController } from "./ChatDraftContext.types";
export const useChatComposer = (
  context: ChatDraftContextController,
  disabled: boolean,
) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);
  const bindFileInput = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
  }, []);
  const available =
    Boolean(context.capabilities?.attachments.available) && !disabled;
  return {
    bindFileInput,
    isDragging,
    chooseFiles: () => inputRef.current?.click(),
    onPaste: (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData.files);
      if (available && files.length) {
        event.preventDefault();
        context.addAttachments(files);
      }
    },
    onDragOver: (event: DragEvent) => {
      if (available && event.dataTransfer.types.includes("Files")) {
        event.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      setDragging(false);
      if (available && event.dataTransfer.files.length) {
        event.preventDefault();
        context.addAttachments(Array.from(event.dataTransfer.files));
      }
    },
  };
};
