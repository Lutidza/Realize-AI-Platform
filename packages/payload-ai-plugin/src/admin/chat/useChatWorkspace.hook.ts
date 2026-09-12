/**
 * @file packages/payload-ai-plugin/src/admin/chat/useChatWorkspace.hook.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Управляет локальной навигацией по истории и выбором размещения чата.
 */

"use client";

import { useId, useState } from "react";
import type { RealizeAIController } from "../RealizeAIContext";
import type { ChatWorkspaceProps } from "./ChatWorkspace.types";

export const useChatWorkspace = (
  controller: RealizeAIController,
  { settings, onChangeDisplayMode }: ChatWorkspaceProps,
) => {
  const [historyVisibility, setHistoryOpen] = useState<boolean>();
  // Пока пользователь не переключал историю, учитывается загружаемая настройка host.
  const isHistoryOpen = historyVisibility ?? settings.showHistory;
  const historyId = useId();
  const historyToggleId = `${historyId}-toggle`;
  const isBusy =
    controller.isCreatingConversation ||
    controller.isSubmitting ||
    Boolean(controller.currentRun);

  const openConversation = async (id: string) => {
    await controller.openConversation(id);
    if (
      (document.getElementById(historyId)?.parentElement?.clientWidth ?? 0) <=
      760
    )
      setHistoryOpen(false);
  };
  const startConversation = async () => {
    await controller.startConversation();
    if (
      (document.getElementById(historyId)?.parentElement?.clientWidth ?? 0) <=
      760
    )
      setHistoryOpen(false);
  };
  const changeDisplayMode = (mode: ChatWorkspaceProps["variant"]) => {
    // Вызов остаётся в пользовательском событии: отдельное окно открывает host.
    onChangeDisplayMode?.(mode);
  };

  return {
    activeTitle:
      controller.detail?.conversation.title ||
      (controller.isCreatingConversation ? "Создаём диалог…" : "Новый диалог"),
    historyId,
    historyToggleId,
    isHistoryOpen,
    isBusy,
    openConversation,
    startConversation,
    changeDisplayMode,
    toggleHistory: () => setHistoryOpen(!isHistoryOpen),
    closeHistory: () => {
      setHistoryOpen(false);
      document.getElementById(historyToggleId)?.focus();
    },
  };
};
