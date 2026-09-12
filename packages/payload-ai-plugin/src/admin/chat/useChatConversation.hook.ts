/**
 * @file packages/payload-ai-plugin/src/admin/chat/useChatConversation.hook.ts
 * @version 1.3.1
 * @date 2026-09-11
 * @description Управляет вводом, отправкой и прокруткой текущего разговора.
 */

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { DataOperationDTO } from "@realize/ai-contracts";
import type { ChatConversationProps } from "./ChatConversation.types";

export const useChatConversation = ({
  controller,
  settings,
}: ChatConversationProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldFollowRef = useRef(true);
  const [clarificationBlockedFor, setClarificationBlockedFor] =
    useState<string>();
  const hintId = useId();
  const bindViewport = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
  }, []);
  const bindInput = useCallback((node: HTMLTextAreaElement | null) => {
    inputRef.current = node;
  }, []);
  const messages = controller.detail?.messages || [];
  const changesByMessage = useMemo(
    () =>
      new Map(
        (controller.detail?.changeRequests || []).map((change) => [
          change.sourceMessageID,
          change,
        ]),
      ),
    [controller.detail?.changeRequests],
  );
  const dataOperationsByMessage = useMemo(() => {
    const grouped = new Map<string, DataOperationDTO[]>();
    for (const operation of controller.detail?.dataOperations ?? []) {
      const existing = grouped.get(operation.sourceMessageID) ?? [];
      grouped.set(operation.sourceMessageID, [...existing, operation]);
    }
    return grouped;
  }, [controller.detail?.dataOperations]);
  const isBusy =
    controller.isCreatingConversation ||
    controller.isSubmitting ||
    controller.workflow.isPending ||
    Boolean(controller.currentRun);
  const canSend =
    controller.detail?.conversation.status !== "archived" &&
    (controller.pendingWorkflowConversationID
      ? !isBusy &&
        controller.ready &&
        controller.pendingWorkflowConversationID ===
          controller.selectedConversationID
      : controller.workflow.isReplying
        ? Boolean(controller.draft.trim()) &&
          controller.workflow.canContinue &&
          !controller.workflow.hasRetry &&
          !controller.context.attachments.length &&
          !controller.context.projectFiles.length &&
          !controller.context.webSearch
        : (Boolean(controller.draft.trim()) ||
            controller.context.attachments.some(
              (item) => item.status === "ready",
            ) ||
            controller.context.projectFiles.length > 0) &&
          !isBusy &&
          controller.ready &&
          controller.agentConfiguration.isReady &&
          controller.workflow.isSelectionReady &&
          !controller.context.hasPendingAttachments &&
          !controller.context.hasFailedAttachments);
  const showRunFeedback =
    controller.isSubmitting || Boolean(controller.currentRun);
  const canClarifyChange =
    !isBusy &&
    !controller.workflow.isReplying &&
    controller.detail?.conversation.status !== "archived";

  useEffect(() => {
    shouldFollowRef.current = true;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [controller.selectedConversationID]);

  useEffect(() => {
    const viewport = viewportRef.current;
    // Чтение предыдущих сообщений не прерывается каждым фрагментом ответа.
    if (viewport && shouldFollowRef.current)
      viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, controller.stream.streamingMessage, showRunFeedback]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [controller.draft]);

  useEffect(() => {
    setClarificationBlockedFor(undefined);
  }, [controller.draft, controller.selectedConversationID]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) {
      shouldFollowRef.current = true;
      void controller.send();
    }
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      !settings.sendOnEnter ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    event.preventDefault();
    if (canSend) {
      shouldFollowRef.current = true;
      void controller.send();
    }
  };

  const selectSuggestion = (suggestion: string) => {
    controller.setDraft(suggestion);
    inputRef.current?.focus();
  };

  const clarifyChange = (messageID: string) => {
    const input = inputRef.current;
    if (!canClarifyChange || !input) return;
    const message = messages.find((item) => item.id === messageID);
    if (!message || message.role !== "assistant") return;
    // Цитируем только начало видимого текста: fenced protocol не переносится в draft.
    const excerpt = message.content
      .split("```", 1)[0]!
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    const clarification = [
      excerpt
        ? `Уточни изменение по ответу: «${excerpt}».`
        : "Уточни изменение по предыдущему ответу.",
      "Определи, требуется ли изменить данные CMS или код проекта. Для данных используй поддерживаемую операцию данных и подготовь её к отдельному подтверждению. Для кода подготовь план с точными путями файлов проекта, изменениями и проверками. Если нужная операция не поддерживается или контекста недостаточно, объясни ограничение и что нужно уточнить. Не придумывай пути файлов и доступные операции.",
    ].join("\n\n");
    const currentDraft = controller.draft;
    if (!currentDraft.includes(clarification)) {
      const nextDraft = currentDraft.trim()
        ? `${currentDraft}\n\n${clarification}`
        : clarification;
      // Программное добавление тоже соблюдает лимит composer без потери текста.
      if (input.maxLength >= 0 && nextDraft.length > input.maxLength) {
        setClarificationBlockedFor(messageID);
        input.focus();
        return;
      }
      controller.setDraft(nextDraft);
    }
    setClarificationBlockedFor(undefined);
    controller.clearError();
    input.focus();
  };

  return {
    messages,
    changesByMessage,
    dataOperationsByMessage,
    isBusy,
    canSend,
    canClarifyChange,
    clarificationBlockedFor,
    clarifyChange,
    showRunFeedback,
    bindViewport,
    bindInput,
    hintId,
    submit,
    submitOnEnter,
    selectSuggestion,
    trackScroll: () => {
      const viewport = viewportRef.current;
      if (viewport)
        shouldFollowRef.current =
          viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <
          80;
    },
  };
};
